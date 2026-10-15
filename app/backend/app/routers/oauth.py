"""OAuth 2.1 endpoints that let MCP clients (Claude Code, Cursor, ...) log in
on behalf of a user, plus the user-facing list of connected AI apps.

Flow: the client discovers the endpoints via the two /.well-known documents,
registers itself, opens /api/v1/oauth/authorize in the browser where the user
logs in with their normal credentials and approves, then exchanges the code
at /api/v1/oauth/token.
"""
import html
import re
import uuid
from typing import Annotated, Optional
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.dependencies import get_current_user
from app.core.exceptions import AuthenticationError, ForbiddenError, NotFoundError
from app.core.rate_limit import limiter
from app.database import get_db
from app.models.user import User
from app.services.oauth_service import OAuthError, OAuthService, redirect_uri_matches

MCP_PATH = "/api/v1/mcp"
OAUTH_PREFIX = "/api/v1/oauth"

# Served at the site root (RFC 8414 / RFC 9728 discovery paths).
well_known_router = APIRouter(include_in_schema=False)
# Protocol endpoints — not part of the REST API surface.
router = APIRouter(prefix="/oauth", include_in_schema=False)
# Connected-apps management for the logged-in web user.
connections_router = APIRouter(prefix="/oauth/connections", tags=["oauth"])

_HOST_RE = re.compile(r"^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$")


def public_base_url(request: Request) -> str:
    """The origin the client used to reach us. nginx terminates TLS and sets
    X-Forwarded-Proto, and X-Forwarded-Host keeps a non-default port that its
    Host header drops. Falls back to FRONTEND_URL for malformed headers."""
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "").lower()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    if proto not in ("http", "https") or not _HOST_RE.match(host):
        return settings.FRONTEND_URL.rstrip("/")
    return f"{proto}://{host}"


def mcp_resource_url(request: Request) -> str:
    return public_base_url(request) + MCP_PATH


# ─── Discovery ────────────────────────────────────────────────────────────

def _protected_resource_metadata(request: Request) -> dict:
    return {
        "resource": mcp_resource_url(request),
        "authorization_servers": [public_base_url(request)],
        "bearer_methods_supported": ["header"],
        "resource_name": "Ekip İş Akışı Yönetimi (MCP)",
    }


@well_known_router.get("/.well-known/oauth-protected-resource")
@well_known_router.get("/.well-known/oauth-protected-resource" + MCP_PATH)
async def protected_resource_metadata(request: Request):
    return _protected_resource_metadata(request)


@well_known_router.get("/.well-known/oauth-authorization-server")
async def authorization_server_metadata(request: Request):
    base = public_base_url(request)
    return {
        "issuer": base,
        "authorization_endpoint": base + OAUTH_PREFIX + "/authorize",
        "token_endpoint": base + OAUTH_PREFIX + "/token",
        "registration_endpoint": base + OAUTH_PREFIX + "/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": ["mcp"],
        "authorization_response_iss_parameter_supported": True,
    }


# ─── Registration & token ─────────────────────────────────────────────────

def _oauth_error(e: OAuthError) -> JSONResponse:
    return JSONResponse(
        status_code=e.status_code,
        content={"error": e.code, "error_description": e.description},
        headers={"Cache-Control": "no-store"},
    )


@router.post("/register")
@limiter.limit("30/hour")
async def register_client(request: Request, db: Annotated[AsyncSession, Depends(get_db)]):
    try:
        body = await request.json()
    except Exception:
        body = None
    if not isinstance(body, dict):
        return _oauth_error(OAuthError("invalid_client_metadata", "JSON gövde bekleniyor."))
    try:
        result = await OAuthService(db).register_client(body)
    except OAuthError as e:
        return _oauth_error(e)
    return JSONResponse(status_code=201, content=result, headers={"Cache-Control": "no-store"})


@router.post("/token")
@limiter.limit("60/minute")
async def token(request: Request, db: Annotated[AsyncSession, Depends(get_db)]):
    form = await request.form()
    grant_type = form.get("grant_type")
    svc = OAuthService(db)
    try:
        if grant_type == "authorization_code":
            result = await svc.exchange_code(
                code=form.get("code"),
                client_id=form.get("client_id"),
                redirect_uri=form.get("redirect_uri"),
                code_verifier=form.get("code_verifier"),
                resource=form.get("resource"),
            )
        elif grant_type == "refresh_token":
            result = await svc.refresh(form.get("refresh_token"), form.get("client_id"))
        else:
            raise OAuthError("unsupported_grant_type", "Desteklenmeyen grant_type.")
    except OAuthError as e:
        return _oauth_error(e)
    return JSONResponse(content=result, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})


# ─── Authorization (browser login + consent page) ─────────────────────────

_AUTH_FIELDS = ("response_type", "client_id", "redirect_uri", "code_challenge",
                "code_challenge_method", "state", "resource", "scope")


async def _validate_authorize_params(request: Request, params: dict, svc: OAuthService):
    """Returns (client, redirect_uri, resource). Raises _PageError for errors that
    must not be redirected (unknown client / redirect URI) and OAuthError for
    errors that are reported back to the client's redirect URI."""
    client = await svc.get_client(params.get("client_id"))
    if not client:
        raise _PageError("Bilinmeyen uygulama (client_id). Bağlantıyı AI uygulamanızdan yeniden başlatın.")
    redirect_uri = params.get("redirect_uri") or ""
    if not redirect_uri and len(client.redirect_uris) == 1:
        redirect_uri = client.redirect_uris[0]
    if not redirect_uri_matches(client.redirect_uris, redirect_uri):
        raise _PageError("redirect_uri bu uygulama için kayıtlı değil.")

    if params.get("response_type") != "code":
        raise OAuthError("unsupported_response_type", "Yalnızca response_type=code desteklenir.")
    challenge = params.get("code_challenge") or ""
    if params.get("code_challenge_method") != "S256" or not re.fullmatch(r"[A-Za-z0-9_\-]{43,128}", challenge):
        raise OAuthError("invalid_request", "PKCE (code_challenge, S256) gerekli.")
    our_resource = mcp_resource_url(request)
    resource = (params.get("resource") or our_resource).rstrip("/")
    if resource != our_resource:
        raise OAuthError("invalid_target", "resource bu sunucunun MCP adresi değil.")
    return client, redirect_uri, resource


class _PageError(Exception):
    pass


def _redirect_target(redirect_uri: str, params: dict) -> str:
    sep = "&" if urlsplit(redirect_uri).query else "?"
    return redirect_uri + sep + urlencode({k: v for k, v in params.items() if v is not None})


async def _branding(db: AsyncSession) -> tuple[str, str]:
    from app.services.branding_service import get_branding
    try:
        b = await get_branding(db)
    except Exception:
        return "Ekip Yönetimi", "#3b82f6"
    color = b.get("primary_color") or ""
    if not re.fullmatch(r"#[0-9A-Fa-f]{3,8}", color):
        color = "#3b82f6"
    return b.get("company_name") or "Ekip Yönetimi", color


_PAGE_CSS = """
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
background:#f3f4f6;color:#111827;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:28px;width:100%;max-width:420px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#6b7280;font-size:13px;margin:0 0 20px}
.app{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:16px;font-size:14px}
.app b{word-break:break-word}.muted{color:#6b7280;font-size:12px;word-break:break-all}
ul{margin:8px 0 0;padding-left:18px;font-size:13px;color:#374151}
label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}
input[type=text],input[type=password]{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px}
.err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;padding:10px;font-size:13px;margin-bottom:12px}
/* approve comes first in the DOM so Enter submits it; shown on the right */
.row{display:flex;flex-direction:row-reverse;gap:8px;margin-top:20px}button{flex:1;padding:11px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid transparent}
.deny{background:#fff;border-color:#d1d5db;color:#374151}a{color:inherit}
@media (prefers-color-scheme:dark){body{background:#111827;color:#f9fafb}.card{background:#1f2937}
.app{background:#111827;border-color:#374151}ul{color:#d1d5db}input[type=text],input[type=password]{background:#111827;color:#f9fafb;border-color:#4b5563}
.deny{background:#1f2937;color:#e5e7eb;border-color:#4b5563}}
"""


def _page(title: str, body: str, status_code: int = 200, color: str = "#3b82f6", head_extra: str = "") -> HTMLResponse:
    doc = (
        "<!DOCTYPE html><html lang=\"tr\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        f"<meta name=\"referrer\" content=\"no-referrer\">{head_extra}"
        f"<title>{html.escape(title)}</title><style>{_PAGE_CSS}"
        f".approve{{background:{color};color:#fff}}</style></head>"
        f"<body><div class=\"card\">{body}</div></body></html>"
    )
    return HTMLResponse(doc, status_code=status_code, headers={"Cache-Control": "no-store"})


def _consent_page(company: str, color: str, client_name: str, redirect_uri: str,
                  params: dict, username: str = "", error: Optional[str] = None,
                  status_code: int = 200) -> HTMLResponse:
    target = urlsplit(redirect_uri)
    target_label = f"{target.scheme}://{target.netloc}" if target.netloc else f"{target.scheme}:"
    hidden = "".join(
        f'<input type="hidden" name="{f}" value="{html.escape(params.get(f) or "")}">'
        for f in _AUTH_FIELDS
    )
    err = f'<div class="err">{html.escape(error)}</div>' if error else ""
    body = f"""
<h1>{html.escape(company)}</h1>
<p class="sub">Yapay zekâ uygulaması bağlantı isteği</p>
{err}
<div class="app"><b>{html.escape(client_name)}</b> hesabınıza bağlanmak istiyor.
<div class="muted">Dönüş adresi: {html.escape(target_label)}</div>
<ul><li>Sizin adınıza, <b>yalnızca sizin yetkileriniz dahilinde</b> kayıtları sorgulayabilir, ekleyebilir, güncelleyebilir ve silebilir.</li>
<li>Envanterdeki şifre ve gizli anahtarları göremez.</li>
<li>Bağlantıyı istediğiniz an Profil sayfasından kaldırabilirsiniz.</li></ul></div>
<form method="post" action="{OAUTH_PREFIX}/authorize" autocomplete="on">
{hidden}
<label for="username">Kullanıcı adı</label>
<input id="username" name="username" type="text" autocomplete="username" required value="{html.escape(username)}" autofocus>
<label for="password">Şifre</label>
<input id="password" name="password" type="password" autocomplete="current-password">
<div class="row">
<button class="approve" type="submit" name="decision" value="approve">Giriş yap ve izin ver</button>
<button class="deny" type="submit" name="decision" value="deny" formnovalidate>Reddet</button>
</div></form>
<p class="muted" style="margin-top:16px">Bu isteği siz başlatmadıysanız <b>Reddet</b>'e basın.</p>"""
    return _page(f"{company} — AI bağlantısı", body, status_code=status_code, color=color)


def _redirect_page(target: str, color: str, message: str) -> HTMLResponse:
    # A meta refresh starts a fresh navigation. A 302 straight from the form
    # POST would be blocked by the CSP form-action 'self' directive, which also
    # governs redirects that follow a form submission.
    safe = html.escape(target, quote=True)
    body = (f"<h1>{html.escape(message)}</h1><p class=\"sub\">Uygulamaya yönlendiriliyorsunuz…</p>"
            f"<p><a class=\"muted\" href=\"{safe}\">Otomatik yönlendirilmezseniz buraya tıklayın.</a></p>"
            "<p class=\"muted\">Bu pencereyi kapatabilirsiniz.</p>")
    return _page(message, body, color=color,
                 head_extra=f"<meta http-equiv=\"refresh\" content=\"0;url={safe}\">")


def _error_page(message: str, color: str) -> HTMLResponse:
    return _page("Bağlantı hatası", f"<h1>Bağlantı kurulamadı</h1><div class=\"err\">{html.escape(message)}</div>",
                 status_code=400, color=color)


@router.get("/authorize")
async def authorize_page(request: Request, db: Annotated[AsyncSession, Depends(get_db)]):
    params = {f: request.query_params.get(f) for f in _AUTH_FIELDS}
    company, color = await _branding(db)
    svc = OAuthService(db)
    try:
        client, redirect_uri, _ = await _validate_authorize_params(request, params, svc)
    except _PageError as e:
        return _error_page(str(e), color)
    except OAuthError as e:
        client = await svc.get_client(params.get("client_id"))
        return _redirect_page(
            _redirect_target(params.get("redirect_uri") or client.redirect_uris[0], {
                "error": e.code, "error_description": e.description,
                "state": params.get("state"), "iss": public_base_url(request),
            }), color, "Bağlantı reddedildi")
    params["redirect_uri"] = redirect_uri
    return _consent_page(company, color, client.client_name, redirect_uri, params)


@router.post("/authorize")
@limiter.limit(settings.AUTH_LOGIN_RATE_LIMIT)
async def authorize_submit(request: Request, db: Annotated[AsyncSession, Depends(get_db)]):
    form = await request.form()
    params = {f: (form.get(f) or None) for f in _AUTH_FIELDS}
    company, color = await _branding(db)
    svc = OAuthService(db)
    try:
        client, redirect_uri, resource = await _validate_authorize_params(request, params, svc)
    except _PageError as e:
        return _error_page(str(e), color)
    except OAuthError as e:
        client = await svc.get_client(params.get("client_id"))
        return _redirect_page(
            _redirect_target(params.get("redirect_uri") or client.redirect_uris[0], {
                "error": e.code, "error_description": e.description,
                "state": params.get("state"), "iss": public_base_url(request),
            }), color, "Bağlantı reddedildi")
    params["redirect_uri"] = redirect_uri
    iss = public_base_url(request)

    if form.get("decision") != "approve":
        return _redirect_page(_redirect_target(redirect_uri, {
            "error": "access_denied", "error_description": "Kullanıcı bağlantıyı reddetti.",
            "state": params.get("state"), "iss": iss,
        }), color, "Bağlantı reddedildi")

    username = str(form.get("username") or "").strip()
    password = str(form.get("password") or "")
    from app.services.auth_service import AuthService, _write_auth_audit
    ip = request.client.host if request.client else None
    try:
        user = await AuthService(db).authenticate(username, password, ip=ip,
                                                  user_agent=request.headers.get("user-agent"))
    except (AuthenticationError, ForbiddenError) as e:
        # Re-render with the error. Status 200 keeps the transaction (e.g. a
        # password rehash is irrelevant here, but nothing is written on failure).
        return _consent_page(company, color, client.client_name, redirect_uri, params,
                             username=username, error=e.detail, status_code=401)

    code = await svc.create_authorization_code(
        client, user, redirect_uri, params["code_challenge"], resource
    )
    import asyncio
    ua = f"MCP OAuth: {client.client_name} | {request.headers.get('user-agent') or ''}"[:500]
    asyncio.ensure_future(_write_auth_audit(user.id, "login", ip, ua))
    return _redirect_page(_redirect_target(redirect_uri, {
        "code": code, "state": params.get("state"), "iss": iss,
    }), color, "Bağlantı onaylandı")


# ─── Connected apps ───────────────────────────────────────────────────────

class OAuthConnection(BaseModel):
    id: uuid.UUID
    client_name: str
    created_at: datetime
    last_used_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


@connections_router.get("", response_model=list[OAuthConnection])
async def list_connections(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await OAuthService(db).list_grants(current_user.id)


@connections_router.delete("/{connection_id}", status_code=204)
async def revoke_connection(
    connection_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not await OAuthService(db).revoke_grant(current_user.id, connection_id):
        raise NotFoundError("Bağlantı")
