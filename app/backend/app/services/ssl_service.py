"""
SSL certificate management service.
Supports PEM upload and JKS → PEM conversion.
Writes active certificate to disk and reloads nginx.
"""
import uuid
import hashlib
import subprocess
from datetime import datetime, timezone
from typing import Optional
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.serialization import (
    Encoding, PrivateFormat, NoEncryption, pkcs12, load_der_private_key
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

    # JKS magic number (legacy Oracle Java KeyStore format)
    _JKS_MAGIC = b"\xfe\xed\xfe\xed"

    @staticmethod
    def _convert_jks_to_pem(jks_bytes: bytes, password: str) -> tuple[bytes, bytes]:
        # Genuine legacy JKS files (magic 0xFEEDFEED) cannot be read by the
        # cryptography library — it only understands PKCS12. Parse those natively.
        # Everything else (real PKCS12, or modern keytool output which is PKCS12
        # despite a .jks extension) goes through the PKCS12 loader.
        if jks_bytes[:4] == SslService._JKS_MAGIC:
            return SslService._convert_native_jks_to_pem(jks_bytes, password)

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
    def _convert_native_jks_to_pem(jks_bytes: bytes, password: str) -> tuple[bytes, bytes]:
        try:
            key_der, cert_chain = SslService._parse_jks(jks_bytes, password)
        except Exception as e:
            raise ValidationError(f"JKS okunamadı (parola yanlış veya dosya bozuk olabilir): {e}")

        if not key_der or not cert_chain:
            raise ValidationError("JKS dosyasında özel anahtar veya sertifika bulunamadı.")

        private_key = load_der_private_key(key_der, password=None, backend=default_backend())
        key_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption())
        # Concatenate the full chain (leaf first) so nginx serves intermediates too.
        cert_pem = b"".join(
            x509.load_der_x509_certificate(c, default_backend()).public_bytes(Encoding.PEM)
            for c in cert_chain
        )
        return cert_pem, key_pem

    @staticmethod
    def _parse_jks(data: bytes, password: str) -> tuple[Optional[bytes], list[bytes]]:
        """Parse a legacy JKS keystore, returning (PKCS#8 key DER, [cert DER, ...])."""
        if data[:4] != SslService._JKS_MAGIC:
            raise ValueError("Geçersiz JKS dosyası (magic eşleşmiyor).")
        off = 4
        version = int.from_bytes(data[off:off + 4], "big"); off += 4
        count = int.from_bytes(data[off:off + 4], "big"); off += 4
        key_der: Optional[bytes] = None
        cert_chain: list[bytes] = []
        for _ in range(count):
            tag = int.from_bytes(data[off:off + 4], "big"); off += 4
            alias_len = int.from_bytes(data[off:off + 2], "big"); off += 2
            off += alias_len                       # alias
            off += 8                               # creation timestamp
            if tag == 1:                           # private key entry
                klen = int.from_bytes(data[off:off + 4], "big"); off += 4
                key_enc = data[off:off + klen]; off += klen
                nchain = int.from_bytes(data[off:off + 4], "big"); off += 4
                for _ in range(nchain):
                    if version == 2:
                        tlen = int.from_bytes(data[off:off + 2], "big"); off += 2
                        off += tlen                # cert type ("X.509")
                    clen = int.from_bytes(data[off:off + 4], "big"); off += 4
                    cert_chain.append(data[off:off + clen]); off += clen
                key_der = SslService._jks_decrypt_key(key_enc, password)
            elif tag == 2:                         # trusted cert entry (skipped)
                if version == 2:
                    tlen = int.from_bytes(data[off:off + 2], "big"); off += 2
                    off += tlen
                clen = int.from_bytes(data[off:off + 4], "big"); off += 4
                off += clen
            else:
                raise ValueError(f"Bilinmeyen JKS entry tipi: {tag}")
        return key_der, cert_chain

    @staticmethod
    def _jks_decrypt_key(epki_der: bytes, password: str) -> bytes:
        """Decrypt the Sun JKS key protector, returning the PKCS#8 PrivateKeyInfo DER."""
        # epki_der is a DER EncryptedPrivateKeyInfo: SEQ { AlgorithmIdentifier, OCTET STRING }
        _, content, _ = SslService._der_read_tlv(epki_der, 0)
        _, _alg, after_alg = SslService._der_read_tlv(content, 0)   # skip AlgorithmIdentifier
        _, enc, _ = SslService._der_read_tlv(content, after_alg)    # encryptedData OCTET STRING
        salt, encrypted, digest = enc[:20], enc[20:-20], enc[-20:]
        pw = password.encode("utf-16-be")          # Java encodes chars as UTF-16BE
        keystream = b""
        cur = salt
        while len(keystream) < len(encrypted):
            cur = hashlib.sha1(pw + cur).digest()
            keystream += cur
        key = bytes(a ^ b for a, b in zip(encrypted, keystream[:len(encrypted)]))
        if hashlib.sha1(pw + key).digest() != digest:
            raise ValueError("parola doğrulaması başarısız")
        return key

    @staticmethod
    def _der_read_tlv(data: bytes, off: int) -> tuple[int, bytes, int]:
        """Read one DER tag-length-value at offset; return (tag, value, next_offset)."""
        tag = data[off]; off += 1
        length = data[off]; off += 1
        if length & 0x80:
            n = length & 0x7F
            length = int.from_bytes(data[off:off + n], "big"); off += n
        return tag, data[off:off + length], off + length

    @staticmethod
    def _reload_nginx() -> None:
        try:
            subprocess.run(["nginx", "-s", "reload"], check=True, timeout=10, capture_output=True)
        except (subprocess.SubprocessError, FileNotFoundError):
            pass  # nginx not available in dev environment
