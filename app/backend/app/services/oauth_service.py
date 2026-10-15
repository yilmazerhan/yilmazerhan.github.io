"""OAuth 2.1 authorization server for MCP clients.

Public clients only (PKCE S256, no client secret) — every MCP desktop/CLI client
is a public client. Access tokens are JWTs typed "mcp" with the MCP endpoint as
audience, so they are rejected by the regular REST API (decode_access_token only
accepts type "access") and REST tokens are rejected by the MCP endpoint.
"""
import base64
import hashlib
import ipaddress
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlsplit

import jwt
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import hash_token
from app.models.oauth import OAuthClient, OAuthAuthorizationCode, OAuthGrant
from app.models.user import User

AUTH_CODE_TTL = timedelta(minutes=5)
MCP_ACCESS_TOKEN_TTL = timedelta(hours=1)
MCP_REFRESH_TOKEN_TTL = timedelta(days=30)  # sliding: renewed on every refresh
MCP_TOKEN_TYPE = "mcp"

_FORBIDDEN_SCHEMES = {"javascript", "data", "file", "vbscript", "about", "blob"}


class OAuthError(Exception):
    """An RFC 6749 error response: {"error": code, "error_description": description}."""

    def __init__(self, code: str, description: str, status_code: int = 400):
        super().__init__(description)
        self.code = code
        self.description = description
        self.status_code = status_code


def _is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def validate_redirect_uri(uri: str) -> None:
    """Accept https URLs, http only on loopback (native apps, RFC 8252), and
    private-use app schemes such as cursor:// or vscode://."""
    if not isinstance(uri, str) or not uri or len(uri) > 2000:
        raise OAuthError("invalid_redirect_uri", "Geçersiz redirect_uri.")
    parts = urlsplit(uri)
    scheme = parts.scheme.lower()
    if not scheme or parts.fragment:
        raise OAuthError("invalid_redirect_uri", "redirect_uri mutlak bir URI olmalı ve fragment içermemeli.")
    if scheme in _FORBIDDEN_SCHEMES:
        raise OAuthError("invalid_redirect_uri", f"'{scheme}' şeması kullanılamaz.")
    if scheme == "http" and not _is_loopback(parts.hostname or ""):
        raise OAuthError("invalid_redirect_uri", "http yalnızca localhost için kullanılabilir; https kullanın.")
    if scheme == "https" and not parts.hostname:
        raise OAuthError("invalid_redirect_uri", "Geçersiz redirect_uri.")


def redirect_uri_matches(registered: list[str], requested: str) -> bool:
    """Exact match, except that loopback redirects may use any port (RFC 8252 §7.3)."""
    if requested in registered:
        return True
    req = urlsplit(requested)
    if req.scheme != "http" or not _is_loopback(req.hostname or ""):
        return False
    for uri in registered:
        reg = urlsplit(uri)
        if (reg.scheme, reg.hostname, reg.path, reg.query) == (req.scheme, req.hostname, req.path, req.query):
            return True
    return False


def _pkce_s256(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _create_mcp_access_token(user: User, grant_id: uuid.UUID, resource: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "gid": str(grant_id),
        "aud": resource,
        "iat": now,
        "exp": now + MCP_ACCESS_TOKEN_TTL,
        "type": MCP_TOKEN_TYPE,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _token_response(access_token: str, refresh_token: str) -> dict:
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": int(MCP_ACCESS_TOKEN_TTL.total_seconds()),
        "refresh_token": refresh_token,
    }


class OAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Dynamic client registration (RFC 7591) ───────────────────────────
    async def register_client(self, body: dict) -> dict:
        redirect_uris = body.get("redirect_uris")
        if not isinstance(redirect_uris, list) or not redirect_uris or len(redirect_uris) > 10:
            raise OAuthError("invalid_redirect_uri", "En az bir (en fazla 10) redirect_uri gerekli.")
        for uri in redirect_uris:
            try:
                validate_redirect_uri(uri)
            except OAuthError as e:
                raise OAuthError("invalid_redirect_uri", e.description)
        grant_types = body.get("grant_types") or ["authorization_code", "refresh_token"]
        if "authorization_code" not in grant_types:
            raise OAuthError("invalid_client_metadata", "authorization_code grant tipi gerekli.")
        name = body.get("client_name")
        name = (name.strip() if isinstance(name, str) else "") or "MCP istemcisi"

        client = OAuthClient(
            client_id=secrets.token_urlsafe(24),
            client_name=name[:200],
            redirect_uris=redirect_uris,
        )
        self.db.add(client)
        await self.db.flush()
        return {
            "client_id": client.client_id,
            "client_id_issued_at": int(datetime.now(timezone.utc).timestamp()),
            "client_name": client.client_name,
            "redirect_uris": client.redirect_uris,
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        }

    async def get_client(self, client_id: Optional[str]) -> Optional[OAuthClient]:
        if not client_id or len(client_id) > 64:
            return None
        return await self.db.get(OAuthClient, client_id)

    # ─── Authorization code ───────────────────────────────────────────────
    async def create_authorization_code(
        self,
        client: OAuthClient,
        user: User,
        redirect_uri: str,
        code_challenge: str,
        resource: str,
    ) -> str:
        # Codes live for minutes; drop expired ones so the table never grows.
        await self.db.execute(
            delete(OAuthAuthorizationCode).where(OAuthAuthorizationCode.expires_at < datetime.now(timezone.utc))
        )
        raw = secrets.token_urlsafe(32)
        self.db.add(OAuthAuthorizationCode(
            code_hash=hash_token(raw),
            client_id=client.client_id,
            user_id=user.id,
            redirect_uri=redirect_uri,
            code_challenge=code_challenge,
            resource=resource,
            expires_at=datetime.now(timezone.utc) + AUTH_CODE_TTL,
        ))
        await self.db.flush()
        return raw

    async def exchange_code(
        self,
        code: Optional[str],
        client_id: Optional[str],
        redirect_uri: Optional[str],
        code_verifier: Optional[str],
        resource: Optional[str],
    ) -> dict:
        if not code or not client_id or not code_verifier or not redirect_uri:
            raise OAuthError("invalid_request", "code, client_id, redirect_uri ve code_verifier gerekli.")
        result = await self.db.execute(
            select(OAuthAuthorizationCode)
            .where(OAuthAuthorizationCode.code_hash == hash_token(code))
            .with_for_update()
        )
        record = result.scalar_one_or_none()
        if (
            not record
            or record.used
            or record.expires_at < datetime.now(timezone.utc)
            or record.client_id != client_id
            or record.redirect_uri != redirect_uri
        ):
            raise OAuthError("invalid_grant", "Yetkilendirme kodu geçersiz veya süresi dolmuş.")
        # Error responses roll the request transaction back, so the code stays
        # unused only for these failed attempts; a successful exchange burns it.
        if not secrets.compare_digest(_pkce_s256(code_verifier), record.code_challenge):
            raise OAuthError("invalid_grant", "PKCE doğrulaması başarısız.")
        if resource and resource.rstrip("/") != record.resource:
            raise OAuthError("invalid_target", "resource yetkilendirme isteğindekiyle eşleşmiyor.")

        user = await self._active_user(record.user_id)
        if not user:
            raise OAuthError("invalid_grant", "Kullanıcı aktif değil.")
        record.used = True
        client = await self.db.get(OAuthClient, client_id)

        # Re-authorizing the same app replaces its previous connection instead
        # of piling up duplicates in the user's connected-apps list.
        await self.db.execute(
            update(OAuthGrant)
            .where(OAuthGrant.user_id == user.id, OAuthGrant.client_id == client_id, OAuthGrant.revoked == False)
            .values(revoked=True)
        )
        raw_refresh = secrets.token_urlsafe(48)
        grant = OAuthGrant(
            user_id=user.id,
            client_id=client_id,
            client_name=client.client_name if client else "MCP istemcisi",
            resource=record.resource,
            refresh_token_hash=hash_token(raw_refresh),
            refresh_expires_at=datetime.now(timezone.utc) + MCP_REFRESH_TOKEN_TTL,
        )
        self.db.add(grant)
        await self.db.flush()
        return _token_response(_create_mcp_access_token(user, grant.id, grant.resource), raw_refresh)

    async def refresh(self, refresh_token: Optional[str], client_id: Optional[str]) -> dict:
        if not refresh_token:
            raise OAuthError("invalid_request", "refresh_token gerekli.")
        result = await self.db.execute(
            select(OAuthGrant)
            .where(OAuthGrant.refresh_token_hash == hash_token(refresh_token))
            .with_for_update()
        )
        grant = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if (
            not grant
            or grant.revoked
            or grant.refresh_expires_at < now
            or (client_id and client_id != grant.client_id)
        ):
            raise OAuthError("invalid_grant", "Refresh token geçersiz, süresi dolmuş veya iptal edilmiş.")
        user = await self._active_user(grant.user_id)
        if not user:
            raise OAuthError("invalid_grant", "Kullanıcı aktif değil.")

        raw_refresh = secrets.token_urlsafe(48)
        grant.refresh_token_hash = hash_token(raw_refresh)
        grant.refresh_expires_at = now + MCP_REFRESH_TOKEN_TTL
        await self.db.flush()
        return _token_response(_create_mcp_access_token(user, grant.id, grant.resource), raw_refresh)

    # ─── Access token verification (MCP endpoint) ─────────────────────────
    async def verify_access_token(self, token: str, resource: str) -> Optional[tuple[User, OAuthGrant]]:
        try:
            payload = jwt.decode(
                token, settings.SECRET_KEY,
                algorithms=["HS256", "HS384", "HS512"],
                audience=resource,
            )
            if payload.get("type") != MCP_TOKEN_TYPE:
                return None
            user_id = uuid.UUID(payload["sub"])
            grant_id = uuid.UUID(payload["gid"])
        except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
            return None
        grant = await self.db.get(OAuthGrant, grant_id)
        if not grant or grant.revoked or grant.user_id != user_id:
            return None
        user = await self._active_user(user_id)
        if not user:
            return None
        return user, grant

    # ─── Connected apps (user-facing) ─────────────────────────────────────
    async def list_grants(self, user_id: uuid.UUID) -> list[OAuthGrant]:
        result = await self.db.execute(
            select(OAuthGrant)
            .where(
                OAuthGrant.user_id == user_id,
                OAuthGrant.revoked == False,
                OAuthGrant.refresh_expires_at > datetime.now(timezone.utc),
            )
            .order_by(OAuthGrant.created_at.desc())
        )
        return list(result.scalars().all())

    async def revoke_grant(self, user_id: uuid.UUID, grant_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            update(OAuthGrant)
            .where(OAuthGrant.id == grant_id, OAuthGrant.user_id == user_id, OAuthGrant.revoked == False)
            .values(revoked=True)
        )
        return result.rowcount > 0

    async def _active_user(self, user_id: uuid.UUID) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False, User.is_active == True)
        )
        return result.scalar_one_or_none()


async def revoke_all_grants(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Disconnect every AI app of a user — called wherever web sessions are
    revoked for security reasons (password change/reset)."""
    await db.execute(
        update(OAuthGrant).where(OAuthGrant.user_id == user_id).values(revoked=True)
    )
