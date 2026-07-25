#!/bin/sh
# Generate self-signed SSL certificate if none exists.
# In production, replace via the admin UI (JKS or PEM upload).
#
# SSL_EXTRA_SANS: optional comma-separated additional SANs, e.g.
#   SSL_EXTRA_SANS="IP:10.20.41.54,DNS:myserver.example.com"
# The values are appended to the default SANs (DNS:localhost,IP:127.0.0.1).

CERT=/ssl/current.crt
KEY=/ssl/current.key

# Allow the (non-root) backend container to replace the cert files on activation.
# The ssl_certs volume is internal and only mounted into nginx + backend.
#
# NOTE: 0777 is wider than necessary — unlink/rename permission comes from the
# DIRECTORY mode, so any uid in either container can replace current.key/.crt even
# though the key file itself is 0600. nginx now mounts this volume :ro (see
# docker-compose.yml), which removes the request-parsing process as a write vector.
# Properly narrowing this needs the backend's uid pinned in backend/Dockerfile and
# `chown`ing here, which would change ownership of existing named volumes on
# upgrade — deliberately left for a coordinated change rather than done silently.
mkdir -p /ssl
chmod 0777 /ssl

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
  echo "SSL certificate already exists, skipping generation."
  exit 0
fi

# Build the SAN string: always include localhost + loopback, then extras
SAN="DNS:localhost,IP:127.0.0.1"
if [ -n "${SSL_EXTRA_SANS}" ]; then
  SAN="${SAN},${SSL_EXTRA_SANS}"
fi

echo "Generating self-signed SSL certificate (SANs: ${SAN})..."
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "$KEY" \
  -out "$CERT" \
  -days 3650 \
  -subj "/C=TR/ST=Istanbul/L=Istanbul/O=TeamApp/OU=IT/CN=localhost" \
  -addext "subjectAltName=${SAN}"

chmod 600 "$KEY"
chmod 644 "$CERT"
echo "Self-signed certificate generated at $CERT"
