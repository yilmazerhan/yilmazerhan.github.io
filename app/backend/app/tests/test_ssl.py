"""
SSL certificate management tests:
- PEM upload and expiry parsing
- JKS → PEM conversion (PKCS12 format)
- Certificate listing, activation, deletion
- Access control (superadmin only)
"""
import io
import datetime
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import patch, MagicMock

from app.models.user import User
from app.tests.conftest import get_auth_headers


# A genuine legacy JKS keystore (magic 0xFEEDFEED), generated with:
#   keytool -genkeypair -alias t -keyalg RSA -keysize 2048 -storetype JKS \
#           -keystore fix.jks -storepass testpass -keypass testpass \
#           -dname "CN=jkstest" -validity 3650
_LEGACY_JKS_B64 = (
    "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"
    "9H6OiY4IJr90jA=="
)


def _generate_self_signed_pem() -> tuple[bytes, bytes]:
    """Generate a real self-signed cert+key pair for tests."""
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.backends import default_backend

    key = rsa.generate_private_key(
        public_exponent=65537, key_size=2048, backend=default_backend()
    )
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, u"test.local"),
    ])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))
        .sign(key, hashes.SHA256(), default_backend())
    )
    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    return cert_pem, key_pem


def _generate_pkcs12(cert_pem: bytes, key_pem: bytes, password: str = "testpass") -> bytes:
    """Wrap a cert+key into PKCS12 (compatible with JKS upload endpoint)."""
    from cryptography.hazmat.primitives.serialization import load_pem_private_key, BestAvailableEncryption
    from cryptography.hazmat.primitives.serialization.pkcs12 import serialize_key_and_certificates
    from cryptography import x509
    from cryptography.hazmat.backends import default_backend

    key = load_pem_private_key(key_pem, password=None, backend=default_backend())
    cert = x509.load_pem_x509_certificate(cert_pem, default_backend())
    return serialize_key_and_certificates(
        name=b"test",
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=BestAvailableEncryption(password.encode()),
    )


class TestSslAccessControl:
    async def test_list_ssl_requires_superadmin(self, client: AsyncClient, regular_user: User):
        headers = await get_auth_headers(client, regular_user.email, "User123!")
        resp = await client.get("/api/v1/admin/ssl", headers=headers)
        assert resp.status_code == 403

    async def test_list_ssl_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/admin/ssl")
        assert resp.status_code == 401

    async def test_manager_cannot_access_ssl(self, client: AsyncClient, manager_user: User):
        headers = await get_auth_headers(client, manager_user.email, "Manager123!")
        resp = await client.get("/api/v1/admin/ssl", headers=headers)
        assert resp.status_code == 403

    async def test_superadmin_can_list_ssl(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")
        resp = await client.get("/api/v1/admin/ssl", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestPemUpload:
    async def test_upload_valid_pem(self, client: AsyncClient, superadmin_user: User):
        cert_pem, key_pem = _generate_self_signed_pem()
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        resp = await client.post(
            "/api/v1/admin/ssl/upload-pem",
            headers=headers,
            files={
                "cert_file": ("cert.pem", io.BytesIO(cert_pem), "application/octet-stream"),
                "key_file": ("key.pem", io.BytesIO(key_pem), "application/octet-stream"),
            },
            data={"name": "Test Cert"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Cert"
        assert data["is_active"] is False
        assert "expires_at" in data
        assert "id" in data

    async def test_upload_invalid_pem_rejected(self, client: AsyncClient, superadmin_user: User):
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        resp = await client.post(
            "/api/v1/admin/ssl/upload-pem",
            headers=headers,
            files={
                "cert_file": ("cert.pem", io.BytesIO(b"not a real cert"), "application/octet-stream"),
                "key_file": ("key.pem", io.BytesIO(b"not a real key"), "application/octet-stream"),
            },
            data={"name": "Bad Cert"},
        )
        assert resp.status_code in (400, 422)


class TestJksUpload:
    async def test_upload_pkcs12_as_jks(self, client: AsyncClient, superadmin_user: User):
        cert_pem, key_pem = _generate_self_signed_pem()
        p12_bytes = _generate_pkcs12(cert_pem, key_pem, password="secret")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        resp = await client.post(
            "/api/v1/admin/ssl/upload-jks",
            headers=headers,
            files={"jks_file": ("store.p12", io.BytesIO(p12_bytes), "application/octet-stream")},
            data={"name": "PKCS12 Cert", "password": "secret"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "PKCS12 Cert"

    async def test_wrong_jks_password_rejected(self, client: AsyncClient, superadmin_user: User):
        cert_pem, key_pem = _generate_self_signed_pem()
        p12_bytes = _generate_pkcs12(cert_pem, key_pem, password="correct")
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        resp = await client.post(
            "/api/v1/admin/ssl/upload-jks",
            headers=headers,
            files={"jks_file": ("store.p12", io.BytesIO(p12_bytes), "application/octet-stream")},
            data={"name": "Bad Pass", "password": "wrong"},
        )
        assert resp.status_code in (400, 422)


class TestSslCertificateLifecycle:
    async def test_activate_certificate(self, client: AsyncClient, superadmin_user: User):
        cert_pem, key_pem = _generate_self_signed_pem()
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        # Upload
        upload_resp = await client.post(
            "/api/v1/admin/ssl/upload-pem",
            headers=headers,
            files={
                "cert_file": ("cert.pem", io.BytesIO(cert_pem), "application/octet-stream"),
                "key_file": ("key.pem", io.BytesIO(key_pem), "application/octet-stream"),
            },
            data={"name": "Activate Me"},
        )
        assert upload_resp.status_code == 201
        cert_id = upload_resp.json()["id"]

        # Activate — mock disk write and nginx reload so test doesn't need real filesystem
        with patch("app.services.ssl_service.SSL_CERT_PATH") as mock_cert_path, \
             patch("app.services.ssl_service.SSL_KEY_PATH") as mock_key_path, \
             patch("app.services.ssl_service.SslService._reload_nginx"):
            mock_cert_path.parent.mkdir = MagicMock()
            mock_cert_path.write_bytes = MagicMock()
            mock_key_path.write_text = MagicMock()
            mock_key_path.chmod = MagicMock()

            activate_resp = await client.post(
                f"/api/v1/admin/ssl/activate/{cert_id}", headers=headers
            )
        assert activate_resp.status_code == 200
        assert activate_resp.json()["is_active"] is True

    async def test_cannot_delete_active_certificate(self, client: AsyncClient, superadmin_user: User):
        cert_pem, key_pem = _generate_self_signed_pem()
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        upload_resp = await client.post(
            "/api/v1/admin/ssl/upload-pem",
            headers=headers,
            files={
                "cert_file": ("cert.pem", io.BytesIO(cert_pem), "application/octet-stream"),
                "key_file": ("key.pem", io.BytesIO(key_pem), "application/octet-stream"),
            },
            data={"name": "Active Cert"},
        )
        cert_id = upload_resp.json()["id"]

        with patch("app.services.ssl_service.SSL_CERT_PATH") as mock_cert_path, \
             patch("app.services.ssl_service.SSL_KEY_PATH") as mock_key_path, \
             patch("app.services.ssl_service.SslService._reload_nginx"):
            mock_cert_path.parent.mkdir = MagicMock()
            mock_cert_path.write_bytes = MagicMock()
            mock_key_path.write_text = MagicMock()
            mock_key_path.chmod = MagicMock()
            await client.post(f"/api/v1/admin/ssl/activate/{cert_id}", headers=headers)

        delete_resp = await client.delete(f"/api/v1/admin/ssl/{cert_id}", headers=headers)
        assert delete_resp.status_code in (400, 422)

    async def test_delete_inactive_certificate(self, client: AsyncClient, superadmin_user: User):
        cert_pem, key_pem = _generate_self_signed_pem()
        headers = await get_auth_headers(client, superadmin_user.email, "Admin123!")

        upload_resp = await client.post(
            "/api/v1/admin/ssl/upload-pem",
            headers=headers,
            files={
                "cert_file": ("cert.pem", io.BytesIO(cert_pem), "application/octet-stream"),
                "key_file": ("key.pem", io.BytesIO(key_pem), "application/octet-stream"),
            },
            data={"name": "Delete Me"},
        )
        cert_id = upload_resp.json()["id"]

        delete_resp = await client.delete(f"/api/v1/admin/ssl/{cert_id}", headers=headers)
        assert delete_resp.status_code == 200

        # No longer in list
        list_resp = await client.get("/api/v1/admin/ssl", headers=headers)
        ids = [c["id"] for c in list_resp.json()]
        assert cert_id not in ids


class TestJksToPemConversion:
    """Unit tests for the _convert_jks_to_pem static method."""

    def test_pkcs12_conversion(self):
        from app.services.ssl_service import SslService
        from cryptography import x509
        from cryptography.hazmat.backends import default_backend

        cert_pem, key_pem = _generate_self_signed_pem()
        p12_bytes = _generate_pkcs12(cert_pem, key_pem, password="testpass")

        out_cert_pem, out_key_pem = SslService._convert_jks_to_pem(p12_bytes, "testpass")

        # Verify the output is valid PEM
        cert = x509.load_pem_x509_certificate(out_cert_pem, default_backend())
        assert cert.subject is not None
        assert out_key_pem.startswith(b"-----BEGIN")

    def test_wrong_password_raises(self):
        from app.services.ssl_service import SslService
        from app.core.exceptions import ValidationError

        cert_pem, key_pem = _generate_self_signed_pem()
        p12_bytes = _generate_pkcs12(cert_pem, key_pem, password="correct")

        with pytest.raises((ValidationError, Exception)):
            SslService._convert_jks_to_pem(p12_bytes, "wrong")

    def test_invalid_bytes_raises(self):
        from app.services.ssl_service import SslService
        from app.core.exceptions import ValidationError

        with pytest.raises((ValidationError, Exception)):
            SslService._convert_jks_to_pem(b"this is not a jks file", "any")

    def test_legacy_jks_conversion(self):
        """Genuine legacy JKS (magic 0xFEEDFEED) must be parsed natively, since the
        cryptography library only reads PKCS12. Fixture: keytool -storetype JKS,
        alias t, store/key password 'testpass', CN=jkstest."""
        import base64
        from app.services.ssl_service import SslService
        from cryptography import x509
        from cryptography.hazmat.backends import default_backend

        jks_bytes = base64.b64decode(_LEGACY_JKS_B64)
        assert jks_bytes[:4] == b"\xfe\xed\xfe\xed"

        cert_pem, key_pem = SslService._convert_jks_to_pem(jks_bytes, "testpass")

        cert = x509.load_pem_x509_certificate(cert_pem, default_backend())
        assert cert.subject.rfc4514_string() == "CN=jkstest"
        assert key_pem.startswith(b"-----BEGIN")

    def test_legacy_jks_wrong_password_raises(self):
        import base64
        from app.services.ssl_service import SslService
        from app.core.exceptions import ValidationError

        jks_bytes = base64.b64decode(_LEGACY_JKS_B64)
        with pytest.raises(ValidationError):
            SslService._convert_jks_to_pem(jks_bytes, "wrongpass")
