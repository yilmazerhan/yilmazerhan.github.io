#!/bin/sh
# Generate self-signed SSL certificate if none exists.
# In production, replace via the admin UI (JKS or PEM upload).

CERT=/ssl/current.crt
KEY=/ssl/current.key

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
  echo "SSL certificate already exists, skipping generation."
  exit 0
fi

echo "Generating self-signed SSL certificate..."
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "$KEY" \
  -out "$CERT" \
  -days 3650 \
  -subj "/C=TR/ST=Istanbul/L=Istanbul/O=TeamApp/OU=IT/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 "$KEY"
chmod 644 "$CERT"
echo "Self-signed certificate generated at $CERT"
