"""MCP tools for the app.

Every tool executes as an in-process call to the app's own REST API with a
short-lived access token for the connected user. Permission checks, validation
and audit logging are therefore exactly those of the web UI — this module adds
no authorization logic of its own besides the operation denylist below.

Tool input schemas are generated from the live OpenAPI document, so they stay
in sync with the API as it changes.
"""
import copy
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from app.core.security import create_access_token
from app.models.user import User

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"
MAX_RESPONSE_CHARS = 60_000
# Path parameter values are ids, enum-like slugs and dates. No '/', '%' or '.'
# so a value can never be decoded into extra path segments by the router.
_SEGMENT = r"[A-Za-z0-9_\-:]+"


# ─── Operations the AI must never reach ───────────────────────────────────
def _is_excluded(method: str, path: str, op: dict) -> bool:
    if path.startswith("/auth/") and not (method == "GET" and path == "/auth/me"):
        return True  # login/refresh/register/reset flows
    if path.startswith(("/oauth", "/mcp")):
        return True
    if path in ("/users/me/change-password", "/users/{user_id}/set-password"):
        return True  # credential changes
    if path == "/inventory/items/{item_id}/reveal":
        return True  # would send stored secrets to the AI provider
    if path.startswith(("/admin/ssl", "/backup", "/admin/backup")):
        return True  # infrastructure: TLS certificates, database restore
    if path.endswith(("/download", "/export")) or path.startswith("/export/"):
        return True  # binary / file downloads
    content = (op.get("requestBody") or {}).get("content") or {}
    if content and "application/json" not in content:
        return True  # multipart file uploads
    return False


@dataclass
class Operation:
    method: str
    path: str  # relative to /api/v1, e.g. /kanban/tasks/{task_id}
    summary: str
    tag: str
    path_params: list[dict]
    query_params: list[dict]
    body_schema: Optional[dict]  # with refs rewritten to #/$defs/...
    body_required: bool
    defs: dict
    regex: re.Pattern = field(repr=False)


class _Catalog:
    def __init__(self, openapi: dict):
        self.components = (openapi.get("components") or {}).get("schemas") or {}
        self.operations: list[Operation] = []
        for full_path, item in (openapi.get("paths") or {}).items():
            if not full_path.startswith(API_PREFIX + "/"):
                continue
            path = full_path[len(API_PREFIX):]
            for method, op in item.items():
                method = method.upper()
                if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                    continue
                if _is_excluded(method, path, op):
                    continue
                self.operations.append(self._build(method, path, op))
        self._index = {(o.method, o.path): o for o in self.operations}

    def _build(self, method: str, path: str, op: dict) -> Operation:
        defs: dict = {}
        path_params, query_params = [], []
        for p in op.get("parameters") or []:
            entry = {
                "name": p["name"],
                "required": bool(p.get("required")),
                "schema": self._convert(p.get("schema") or {}, defs),
            }
            if p.get("description"):
                entry["schema"]["description"] = p["description"]
            if p.get("in") == "path":
                path_params.append(entry)
            elif p.get("in") == "query":
                query_params.append(entry)
        body_schema, body_required = None, False
        rb = op.get("requestBody")
        if rb:
            schema = ((rb.get("content") or {}).get("application/json") or {}).get("schema")
            if schema:
                body_schema = self._convert(schema, defs)
                body_required = bool(rb.get("required"))
        pattern = re.sub(r"\\\{[^/]+?\\\}", _SEGMENT, re.escape(path))
        tags = op.get("tags") or ["other"]
        return Operation(
            method=method, path=path, summary=op.get("summary") or "",
            tag=tags[0], path_params=path_params, query_params=query_params,
            body_schema=body_schema, body_required=body_required, defs=defs,
            regex=re.compile("^" + pattern + "$"),
        )

    def _convert(self, schema: Any, defs: dict) -> Any:
        """Deep-copy an OpenAPI schema into plain JSON Schema: component refs
        become #/$defs/... (collected transitively into `defs`), titles dropped."""
        if isinstance(schema, list):
            return [self._convert(s, defs) for s in schema]
        if not isinstance(schema, dict):
            return schema
        out = {}
        for key, value in schema.items():
            if key in ("properties", "$defs", "patternProperties") and isinstance(value, dict):
                # Keys here are field names, not schema keywords (a field may be called "title").
                out[key] = {k: self._convert(v, defs) for k, v in value.items()}
                continue
            if key == "title":
                continue
            if key == "$ref" and isinstance(value, str) and value.startswith("#/components/schemas/"):
                name = value.rsplit("/", 1)[1]
                out["$ref"] = f"#/$defs/{name}"
                if name not in defs:
                    defs[name] = {}  # placeholder breaks reference cycles
                    defs[name] = self._convert(self.components.get(name, {}), defs)
                continue
            out[key] = self._convert(value, defs) if isinstance(value, (dict, list)) else value
        return out

    def get(self, method: str, path: str) -> Optional[Operation]:
        return self._index.get((method, path))

    def match(self, method: str, concrete_path: str) -> Optional[Operation]:
        # Prefer a literal template (e.g. /kanban/tasks/bulk) over a parameterised one.
        exact = self._index.get((method, concrete_path))
        if exact:
            return exact
        for op in self.operations:
            if op.method == method and op.regex.match(concrete_path):
                return op
        return None


_catalog: Optional[_Catalog] = None


def catalog() -> _Catalog:
    global _catalog
    if _catalog is None:
        from app.main import app
        _catalog = _Catalog(app.openapi())
    return _catalog


# ─── Execution ────────────────────────────────────────────────────────────
@dataclass
class CallContext:
    user: User
    client_name: str
    base_url: str
    client_ip: str


class ToolError(Exception):
    pass


async def call_api(
    ctx: CallContext,
    method: str,
    path: str,
    query: Optional[dict] = None,
    body: Any = None,
) -> tuple[bool, str]:
    """Run one API request as the user. Returns (is_error, text)."""
    from app.main import app

    headers = {
        "Authorization": f"Bearer {create_access_token(ctx.user.id, ctx.user.role)}",
        # Audit log rows show the request came through an AI client.
        "User-Agent": f"MCP ({ctx.client_name})"[:300],
        "X-Real-IP": ctx.client_ip,
        "Accept": "application/json",
    }
    params = {k: v for k, v in (query or {}).items() if v is not None}
    transport = httpx.ASGITransport(app=app, client=(ctx.client_ip, 0))
    async with httpx.AsyncClient(transport=transport, base_url=ctx.base_url, timeout=60) as client:
        resp = await client.request(
            method, API_PREFIX + path, params=params, headers=headers,
            json=body if method in ("POST", "PUT", "PATCH") else None,
        )
    return resp.status_code >= 400, _format_response(resp)


def _format_response(resp: httpx.Response) -> str:
    status = resp.status_code
    ctype = resp.headers.get("content-type", "")
    if status == 204 or not resp.content:
        return f"HTTP {status}: işlem başarılı (içerik yok)." if status < 400 else f"HTTP {status}"
    if "json" in ctype:
        try:
            data = resp.json()
        except ValueError:
            data = None
        if status >= 400:
            detail = data.get("detail") if isinstance(data, dict) else data
            if not isinstance(detail, str):
                detail = json.dumps(detail, ensure_ascii=False, default=str)
            return f"HTTP {status}: {detail}"
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str)
    elif ctype.startswith("text/"):
        text = resp.text
        if status >= 400:
            return f"HTTP {status}: {text[:2000]}"
    else:
        return f"HTTP {status}: ikili ({ctype or 'bilinmeyen'}) içerik MCP üzerinden döndürülemez."
    if len(text) > MAX_RESPONSE_CHARS:
        text = (text[:MAX_RESPONSE_CHARS]
                + f"\n[... yanıt {len(text)} karakter, ilk {MAX_RESPONSE_CHARS} gösterildi. "
                  "Filtre veya skip/limit parametreleriyle daraltın.]")
    return text


def _fill_path(template: str, path_params: list[dict], args: dict) -> str:
    path = template
    for p in path_params:
        value = args.get(p["name"])
        if value is None or not re.fullmatch(_SEGMENT, str(value)):
            raise ToolError(f"'{p['name']}' parametresi gerekli ve geçerli bir kimlik olmalı.")
        path = path.replace("{" + p["name"] + "}", str(value))
    return path


# ─── Curated tools ────────────────────────────────────────────────────────
# (tool name, method, API path, description). Input schemas come from OpenAPI.
CURATED: list[tuple[str, str, str, str]] = [
    # Work log
    ("list_work_types", "GET", "/worklogs/work-types",
     "List the work types (categories) used for work-log entries. Use an id from here as "
     "work_type_id when creating or updating a work log."),
    ("list_worklogs", "GET", "/worklogs",
     "List work-log entries, newest first. Regular users see only their own entries; team "
     "managers can also see their team members' entries (filter with user_id). Filter by date "
     "range with date_from/date_to (YYYY-MM-DD). Paginate with skip/limit; the response "
     "includes the total count."),
    ("get_worklog_summary", "GET", "/worklogs/stats/summary",
     "Summary statistics of logged hours (totals and breakdowns) for the given filters."),
    ("create_worklog", "POST", "/worklogs",
     "Log time worked. duration_hours is a number of hours (e.g. 1.5); description must be "
     "at least 5 characters. Managers may log on behalf of a team member with target_user_id. "
     "Regular users can only create entries for themselves."),
    ("update_worklog", "PATCH", "/worklogs/{log_id}",
     "Change fields of a work-log entry; omitted fields are left unchanged. Regular users can "
     "only edit their own entries up to 3 days old."),
    ("delete_worklog", "DELETE", "/worklogs/{log_id}",
     "Permanently delete a work-log entry (same ownership rules as update_worklog)."),
    # Kanban
    ("list_boards", "GET", "/kanban/boards", "List the kanban boards visible to you."),
    ("list_kanban_columns", "GET", "/kanban/columns",
     "List kanban columns (statuses such as To Do / In Progress / Done), optionally for one "
     "board_id. A task's column is its status; use a column id with create_task or move_task."),
    ("list_kanban_labels", "GET", "/kanban/labels", "List the labels that can be attached to tasks."),
    ("list_tasks", "GET", "/kanban/tasks",
     "Search kanban tasks visible to you. Filters: board_id, column_id (status), assignee_id, "
     "team_id, label_id, priority (low/medium/high/critical), due_before (YYYY-MM-DD), search "
     "(text in title/description), include_archived. Paginate with skip/limit."),
    ("get_task", "GET", "/kanban/tasks/{task_id}", "Get one kanban task with all its fields."),
    ("create_task", "POST", "/kanban/tasks",
     "Create a kanban task in the given column. Look up column_id with list_kanban_columns and "
     "assignee_id with list_users first."),
    ("update_task", "PATCH", "/kanban/tasks/{task_id}",
     "Change fields of a kanban task; omitted fields are left unchanged. To change its status "
     "use move_task instead. Set is_archived=true to archive."),
    ("move_task", "PATCH", "/kanban/tasks/{task_id}/move",
     "Move a task to another column (i.e. change its status). sort_order is the position "
     "within the target column, 0 = top."),
    ("delete_task", "DELETE", "/kanban/tasks/{task_id}", "Permanently delete a kanban task."),
    ("list_task_comments", "GET", "/kanban/tasks/{task_id}/comments", "List the comments on a kanban task."),
    ("add_task_comment", "POST", "/kanban/tasks/{task_id}/comments", "Add a comment to a kanban task."),
    # Leave
    ("list_leaves", "GET", "/leaves",
     "List leave (time-off) requests. Regular users see their own; team managers see their "
     "teams'. Filter by status (pending/approved/rejected/cancelled), user_id and an "
     "overlapping date range (date_from/date_to)."),
    ("create_leave", "POST", "/leaves",
     "Request leave for yourself from start_date to end_date (inclusive, YYYY-MM-DD). The "
     "request starts as pending until a manager reviews it."),
    ("update_leave", "PATCH", "/leaves/{leave_id}",
     "Review or cancel a leave request: status approved/rejected (managers, with an optional "
     "review_note) or cancelled (the requester)."),
    # Team tasks
    ("list_team_tasks", "GET", "/team-tasks",
     "List team tasks (assignments with a deadline, distinct from kanban tasks) visible to "
     "you, including each assignee's completion state."),
    ("create_team_task", "POST", "/team-tasks",
     "Create a team task with a deadline (YYYY-MM-DD) and assignees (managers and admins only). "
     "Assignees are notified."),
    ("update_team_task", "PATCH", "/team-tasks/{task_id}",
     "Change a team task's fields, status or assignees; omitted fields are left unchanged."),
    ("complete_team_task", "PATCH", "/team-tasks/{task_id}/complete",
     "Toggle your own completion mark on a team task assigned to you (call again to undo)."),
    ("delete_team_task", "DELETE", "/team-tasks/{task_id}", "Delete a team task."),
    # Inventory
    ("list_inventory_items", "GET", "/inventory/items",
     "Search the IT inventory (servers, databases, devices, accounts...). Filter by item_type, "
     "search text, tags, group_id, is_active. Stored passwords and keys are never returned — "
     "only has_password/has_ssh_key flags."),
    ("get_inventory_item", "GET", "/inventory/items/{item_id}", "Get one inventory item (without its secrets)."),
    ("create_inventory_item", "POST", "/inventory/items", "Add an item to the inventory."),
    ("update_inventory_item", "PATCH", "/inventory/items/{item_id}",
     "Change fields of an inventory item; omitted fields are left unchanged."),
    ("delete_inventory_item", "DELETE", "/inventory/items/{item_id}", "Delete an inventory item."),
    # Customer patches
    ("list_patch_customers", "GET", "/patches/customers", "List the customers patches can be applied to."),
    ("list_patches", "GET", "/patches",
     "Search customer patch records. Filter by search text, status, environment and apply-date "
     "range (date_from/date_to). Paginate with skip/limit."),
    ("get_patch", "GET", "/patches/{patch_id}", "Get one customer patch record."),
    ("create_patch", "POST", "/patches", "Record a patch applied (or planned) for one or more customers."),
    ("update_patch", "PATCH", "/patches/{patch_id}",
     "Change fields of a patch record; omitted fields are left unchanged."),
    ("delete_patch", "DELETE", "/patches/{patch_id}", "Delete a patch record."),
    # Releases
    ("list_releases", "GET", "/releases", "List releases with their phases and milestones."),
    ("create_release", "POST", "/releases", "Create a release."),
    ("update_release", "PATCH", "/releases/{release_id}", "Change a release's fields."),
    ("delete_release", "DELETE", "/releases/{release_id}", "Delete a release with its phases and milestones."),
    # People & misc
    ("list_users", "GET", "/users",
     "Find users (to get ids for assignee_id, user_id, ...). Filter by search (name, username, "
     "email), team_id, role, is_active."),
    ("list_teams", "GET", "/teams", "List teams."),
    ("list_announcements", "GET", "/announcements/active", "List the announcements currently shown to you."),
    ("list_notifications", "GET", "/notifications", "List your notifications."),
]

_GENERIC_TOOLS = [
    {
        "name": "api_list_operations",
        "title": "List all API operations",
        "description": (
            "List every API operation available through api_request (method, path, summary), "
            "for anything the dedicated tools don't cover — e.g. email workflows, permissions, "
            "responsibility groups, release phases, report schedules, audit logs. Optionally "
            "filter by a case-insensitive text matched against path, summary and module."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"filter": {"type": "string", "description": "e.g. 'release', 'email', 'permission'"}},
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "api_describe_operation",
        "title": "Describe an API operation",
        "description": (
            "Return the parameters and JSON request-body schema of one operation listed by "
            "api_list_operations. Call this before api_request for a write operation."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]},
                "path": {"type": "string", "description": "Path template exactly as listed, e.g. /releases/{release_id}/phases"},
            },
            "required": ["method", "path"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "api_request",
        "title": "Call an API operation",
        "description": (
            "Call any operation from api_list_operations as the logged-in user, with that user's "
            "permissions. Fill path placeholders with real ids (path '/releases/3f2b.../phases'), "
            "put query parameters in `query` and the JSON body in `body`. Returns the JSON response "
            "or the API's error message."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]},
                "path": {"type": "string", "description": "Concrete path relative to /api/v1, ids filled in"},
                "query": {"type": "object", "description": "Query-string parameters"},
                "body": {"description": "JSON request body for POST/PUT/PATCH"},
            },
            "required": ["method", "path"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": True, "openWorldHint": False},
    },
]


def _annotations(method: str) -> dict:
    if method == "GET":
        return {"readOnlyHint": True, "openWorldHint": False}
    if method == "DELETE":
        return {"readOnlyHint": False, "destructiveHint": True, "openWorldHint": False}
    return {"readOnlyHint": False, "destructiveHint": False, "openWorldHint": False}


@dataclass
class CuratedTool:
    name: str
    op: Operation
    definition: dict
    body_fields: Optional[list[str]]  # flattened body properties, or None if nested under "body"


def _build_curated(cat: _Catalog) -> dict[str, CuratedTool]:
    tools: dict[str, CuratedTool] = {}
    for name, method, path, description in CURATED:
        op = cat.get(method, path)
        if not op:
            logger.warning("MCP tool %s skipped: %s %s not in the API", name, method, path)
            continue
        defs = copy.deepcopy(op.defs)
        props: dict = {}
        required: list[str] = []
        for p in op.path_params:
            props[p["name"]] = p["schema"]
            required.append(p["name"])
        for p in op.query_params:
            props[p["name"]] = p["schema"]
            if p["required"]:
                required.append(p["name"])
        body_fields = None
        if op.body_schema is not None:
            body = op.body_schema
            ref = body.get("$ref", "")
            target = defs.get(ref.rsplit("/", 1)[1]) if ref.startswith("#/$defs/") else body
            fields = (target or {}).get("properties")
            if isinstance(fields, dict) and not (set(fields) & set(props)):
                # Flatten the body's top-level fields into the tool's arguments.
                props.update(fields)
                required.extend(f for f in (target.get("required") or []) if f not in required)
                body_fields = list(fields)
                if ref:
                    # The body model is now inlined; drop its $defs entry unless
                    # something else still references it.
                    def_name = ref.rsplit("/", 1)[1]
                    others = {k: v for k, v in defs.items() if k != def_name}
                    if f'"{ref}"' not in json.dumps([props, others]):
                        defs.pop(def_name, None)
            else:
                props["body"] = body
                if op.body_required:
                    required.append("body")
        schema: dict = {"type": "object", "properties": props, "additionalProperties": False}
        if required:
            schema["required"] = required
        if defs:
            schema["$defs"] = defs
        tools[name] = CuratedTool(
            name=name, op=op, body_fields=body_fields,
            definition={
                "name": name,
                "title": op.summary or name,
                "description": description,
                "inputSchema": schema,
                "annotations": _annotations(method),
            },
        )
    return tools


_curated: Optional[dict[str, CuratedTool]] = None


def curated_tools() -> dict[str, CuratedTool]:
    global _curated
    if _curated is None:
        _curated = _build_curated(catalog())
    return _curated


WHOAMI_TOOL = {
    "name": "whoami",
    "title": "Who am I",
    "description": (
        "Return the logged-in user's profile (id, name, role, teams) and effective permissions "
        "per module. Call this first to know which actions the user is allowed to take."
    ),
    "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    "annotations": {"readOnlyHint": True, "openWorldHint": False},
}


def list_tool_definitions() -> list[dict]:
    return [WHOAMI_TOOL] + [t.definition for t in curated_tools().values()] + _GENERIC_TOOLS


# ─── Dispatch ─────────────────────────────────────────────────────────────
async def run_tool(ctx: CallContext, name: str, args: dict) -> tuple[bool, str]:
    """Execute a known tool (see list_tool_definitions). Returns (is_error, text)."""
    if not isinstance(args, dict):
        raise ToolError("arguments bir nesne olmalı.")

    if name == "whoami":
        err, me = await call_api(ctx, "GET", "/auth/me")
        if err:
            return err, me
        _, perms = await call_api(ctx, "GET", "/permissions/effective/me")
        return False, json.dumps({"user": json.loads(me), "permissions": _safe_json(perms)},
                                 ensure_ascii=False, separators=(",", ":"))

    if name == "api_list_operations":
        flt = str(args.get("filter") or "").lower()
        lines = [
            f"{o.method} {o.path} — {o.summary} [{o.tag}]"
            for o in catalog().operations
            if not flt or flt in f"{o.path} {o.summary} {o.tag}".lower()
        ]
        return False, "\n".join(lines) or "Eşleşen işlem yok."

    if name == "api_describe_operation":
        op = catalog().get(str(args.get("method", "")).upper(), str(args.get("path", "")))
        if not op:
            raise ToolError("Bu işlem bulunamadı veya MCP üzerinden kullanılamıyor. api_list_operations ile kontrol edin.")
        return False, json.dumps({
            "method": op.method, "path": op.path, "summary": op.summary,
            "path_params": op.path_params, "query_params": op.query_params,
            "body": op.body_schema, "body_required": op.body_required, "$defs": op.defs,
        }, ensure_ascii=False, separators=(",", ":"))

    if name == "api_request":
        method = str(args.get("method", "")).upper()
        path = str(args.get("path", "")).strip()
        if path.startswith(API_PREFIX + "/"):
            path = path[len(API_PREFIX):]
        if not path.startswith("/") or "?" in path or "#" in path:
            raise ToolError("path '/' ile başlamalı ve sorgu (?) içermemeli; sorgu parametrelerini 'query' alanına koyun.")
        if not catalog().match(method, path):
            raise ToolError(f"{method} {path} MCP üzerinden kullanılabilir bir işlemle eşleşmiyor. api_list_operations ile kontrol edin.")
        query = args.get("query") or {}
        if not isinstance(query, dict):
            raise ToolError("query bir nesne olmalı.")
        return await call_api(ctx, method, path, query=query, body=args.get("body"))

    tool = curated_tools()[name]
    op = tool.op
    known = {p["name"] for p in op.path_params} | {p["name"] for p in op.query_params}
    known |= set(tool.body_fields or ([] if op.body_schema is None else ["body"]))
    unknown = set(args) - known
    if unknown:
        raise ToolError(f"Bilinmeyen parametre(ler): {', '.join(sorted(unknown))}")
    path = _fill_path(op.path, op.path_params, args)
    query = {p["name"]: args[p["name"]] for p in op.query_params if p["name"] in args}
    body = None
    if tool.body_fields is not None:
        body = {k: args[k] for k in tool.body_fields if k in args}
    elif op.body_schema is not None:
        body = args.get("body")
    return await call_api(ctx, op.method, path, query=query, body=body)


def _safe_json(text: str) -> Any:
    try:
        return json.loads(text)
    except ValueError:
        return text
