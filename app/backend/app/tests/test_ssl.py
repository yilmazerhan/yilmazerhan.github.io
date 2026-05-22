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
    from cryptography.hazmat.primitives.serialization import pkcs12, load_pem_private_key
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
        encryption_algorithm=pkcs12.BestAvailableEncryption(password.encode()),
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
