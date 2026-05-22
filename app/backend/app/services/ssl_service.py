"""
SSL certificate management service.
Supports PEM upload and JKS → PEM conversion.
Writes active certificate to disk and reloads nginx.
"""
import uuid
import subprocess
from datetime import datetime, timezone
from typing import Optional
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.serialization import (
    Encoding, PrivateFormat, NoEncryption, pkcs12
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.ssl_certificate import SslCertificate
from app.core.security import encrypt_field, decrypt_field
from app.config import settings
from app.core.exceptions import NotFoundError, ValidationError

SSL_CERT_PATH = Path("/app/ssl/current.crt")
SSL_KEY_PATH = Path("/app/ssl/current.key")


class SslService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_certificates(self) -> list[SslCertificate]:
        result = await self.db.execute(
            select(SslCertificate).order_by(SslCertificate.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_certificate(self, cert_id: uuid.UUID) -> SslCertificate:
        result = await self.db.execute(
            select(SslCertificate).where(SslCertificate.id == cert_id)
        )
        cert = result.scalar_one_or_none()
        if not cert:
            raise NotFoundError("SSL sertifikası")
        return cert

    async def upload_pem(
        self,
        name: str,
        cert_pem_bytes: bytes,
        key_pem_bytes: bytes,
        uploaded_by: uuid.UUID,
    ) -> SslCertificate:
        expires_at = self._parse_cert_expiry(cert_pem_bytes)
        key_encrypted = encrypt_field(key_pem_bytes.decode(), settings.SSL_ENCRYPTION_KEY)
        cert = SslCertificate(
            name=name,
            cert_pem=cert_pem_bytes,
            key_pem_encrypted=key_encrypted,
            expires_at=expires_at,
            uploaded_by=uploaded_by,
        )
        self.db.add(cert)
        await self.db.flush()
        return cert

    async def upload_jks(
        self,
        name: str,
        jks_bytes: bytes,
        password: str,
        uploaded_by: uuid.UUID,
    ) -> SslCertificate:
        cert_pem, key_pem = self._convert_jks_to_pem(jks_bytes, password)
        return await self.upload_pem(name, cert_pem, key_pem, uploaded_by)

    async def activate_certificate(self, cert_id: uuid.UUID) -> SslCertificate:
        # Deactivate all
        all_certs = await self.list_certificates()
        for c in all_certs:
            c.is_active = False

        cert = await self.get_certificate(cert_id)
        cert.is_active = True
        await self.db.flush()

        # Write to disk and reload nginx
        key_pem = decrypt_field(cert.key_pem_encrypted, settings.SSL_ENCRYPTION_KEY)
        SSL_CERT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SSL_CERT_PATH.write_bytes(cert.cert_pem)
        SSL_KEY_PATH.write_text(key_pem)
        SSL_KEY_PATH.chmod(0o600)
        self._reload_nginx()

        return cert

    async def delete_certificate(self, cert_id: uuid.UUID) -> None:
        cert = await self.get_certificate(cert_id)
        if cert.is_active:
            raise ValidationError("Aktif sertifika silinemez. Önce başka bir sertifika aktive edin.")
        await self.db.delete(cert)
        await self.db.flush()

    @staticmethod
    def _parse_cert_expiry(cert_pem: bytes) -> datetime:
        try:
            cert = x509.load_pem_x509_certificate(cert_pem, default_backend())
            dt = cert.not_valid_after_utc if hasattr(cert, 'not_valid_after_utc') else cert.not_valid_after.replace(tzinfo=timezone.utc)
            return dt
        except Exception as e:
            raise ValidationError(f"PEM sertifikası okunamadı: {e}")

    @staticmethod
    def _convert_jks_to_pem(jks_bytes: bytes, password: str) -> tuple[bytes, bytes]:
        try:
            private_key, certificate, additional_certs = pkcs12.load_key_and_certificates(
                jks_bytes, password.encode(), default_backend()
            )
        except Exception as e:
            raise ValidationError(f"JKS/PKCS12 dönüşümü başarısız: {e}")

        if not private_key or not certificate:
            raise ValidationError("JKS dosyasında anahtar veya sertifika bulunamadı.")

        cert_pem = certificate.public_bytes(Encoding.PEM)
        key_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption())
        return cert_pem, key_pem

    @staticmethod
    def _reload_nginx() -> None:
        try:
            subprocess.run(["nginx", "-s", "reload"], check=True, timeout=10, capture_output=True)
        except (subprocess.SubprocessError, FileNotFoundError):
            pass  # nginx not available in dev environment
