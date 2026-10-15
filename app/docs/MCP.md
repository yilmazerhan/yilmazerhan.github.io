# MCP Interface (AI assistants)

The app exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so AI
assistants such as Claude Code, Claude Desktop, Cursor or VS Code can query and change data
**as the logged-in user, with exactly that user's permissions**.

- MCP endpoint: `https://<your-host>/api/v1/mcp` (Streamable HTTP transport)
- Login: OAuth 2.1 in the browser with the user's normal username and password
- Every user finds the URL, setup snippets and their connected apps under **Profile → AI app connections (MCP)**

## Connecting a client

The first time a client connects, it opens a browser window. The user logs in on the app's
consent page and clicks **Giriş yap ve izin ver**; the client then receives its tokens and
refreshes them on its own.

| Client | Setup |
|---|---|
| Claude Code | `claude mcp add --transport http teamapp https://<host>/api/v1/mcp`, then `/mcp` → *Authenticate* |
| Claude Desktop | Settings → Developer → Edit config, add `{"mcpServers": {"teamapp": {"command": "npx", "args": ["-y", "mcp-remote", "https://<host>/api/v1/mcp"]}}}`, restart. Requires Node.js. |
| Cursor | `~/.cursor/mcp.json`: `{"mcpServers": {"teamapp": {"url": "https://<host>/api/v1/mcp"}}}` |
| VS Code | `.vscode/mcp.json`: `{"servers": {"teamapp": {"type": "http", "url": "https://<host>/api/v1/mcp"}}}` |

**Network reachability.** Clients that run on the user's machine (Claude Code, Cursor,
VS Code, Claude Desktop through `mcp-remote`) connect directly, so an internal-only server
works. claude.ai on the web, and connectors added in Claude Desktop's *Connectors* settings,
connect from Anthropic's cloud; they need the server to be reachable from the internet.

**Certificates.** Clients verify TLS. With the self-signed fallback certificate, install a
trusted certificate (Settings → SSL) or point Node-based clients at the CA with
`NODE_EXTRA_CA_CERTS`.

## What the AI can do

Tools run as in-process calls to the REST API with a short-lived token for the user, so the
API's own permission checks, validation and audit logging apply unchanged. Audit log rows
from AI calls carry the user agent `MCP (<client name>)`; the OAuth login is logged as a
`login` with `MCP OAuth: <client name>`.

- **Dedicated tools** for work logs, kanban tasks/comments, leave requests, team tasks,
  inventory, customer patches, releases, and lookups (users, teams, boards, columns, labels,
  announcements, notifications), plus `whoami` (profile and effective permissions).
- **Generic access** to the rest of the API: `api_list_operations` → `api_describe_operation`
  → `api_request`.

Tool input schemas are generated from the live OpenAPI document (`app/mcp/tools.py`), so new
or changed API fields show up automatically. Adding a dedicated tool is one line in `CURATED`.

**Never exposed**, even to a superadmin (`_is_excluded` in `app/mcp/tools.py`): login,
registration and password flows; password changes; revealing stored inventory secrets
(responses only carry `has_password`-style flags); SSL certificate management; database
backups and restore; file uploads and binary downloads/exports; the OAuth and MCP endpoints
themselves.

## Security model

- OAuth 2.1 authorization code flow with PKCE (S256) and dynamic client registration
  (RFC 7591); public clients only. Discovery: `/.well-known/oauth-protected-resource` and
  `/.well-known/oauth-authorization-server` (nginx routes them to the backend).
- Redirect URIs: `https://`, `http://` on loopback only (any port, RFC 8252), or an app
  scheme such as `cursor://`. Never `javascript:`, `data:`, `file:` and the like.
- Access tokens: JWT, 1 hour, audience = the MCP endpoint URL, type `mcp`. The REST API
  rejects them and the MCP endpoint rejects regular web tokens.
- Refresh tokens: opaque, rotated on every use, valid 30 days from last use.
- Each approval is a *connection* (`oauth_grants`). It is checked on every request, so
  removing it on the Profile page cuts the client off at once. A password change or reset
  removes all of the user's connections; deactivating or deleting the user blocks them too.
- The consent page is rate-limited like the web login and sends no secrets to the client
  except through the redirect. Browser requests to `/api/v1/mcp` with a foreign `Origin`
  are refused (DNS rebinding protection).

## Endpoints

| Path | Purpose |
|---|---|
| `POST /api/v1/mcp` | MCP JSON-RPC (stateless; `GET`/`DELETE` return 405) |
| `GET /.well-known/oauth-protected-resource[/api/v1/mcp]` | Protected resource metadata (RFC 9728) |
| `GET /.well-known/oauth-authorization-server` | Authorization server metadata (RFC 8414) |
| `POST /api/v1/oauth/register` | Dynamic client registration |
| `GET/POST /api/v1/oauth/authorize` | Login + consent page |
| `POST /api/v1/oauth/token` | `authorization_code` and `refresh_token` grants |
| `GET /api/v1/oauth/connections`, `DELETE …/{id}` | The current user's connected apps |

Behind nginx the backend builds every advertised URL from `X-Forwarded-Proto` and
`X-Forwarded-Host`, so the server works on any host name or port it is reached by.

## Local development

Point a client at the backend directly: `http://localhost:8000/api/v1/mcp`. The Vite dev
server's proxy rewrites the `Host` header, so URLs through port 3000 would not match.
