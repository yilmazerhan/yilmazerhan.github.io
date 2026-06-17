#!/bin/sh
# Reload nginx whenever the active SSL certificate changes.
#
# The backend writes the activated certificate to the shared ssl_certs volume
# (/etc/nginx/ssl/current.crt). nginx caches certificates at load time, so it
# must be told to reload. The backend cannot signal nginx across containers, so
# this watcher runs inside the nginx container and polls the cert's mtime.

CERT=/etc/nginx/ssl/current.crt

# Wait for the nginx master to be up (it writes its pid file on startup).
while [ ! -f /var/run/nginx.pid ]; do
  sleep 1
done

last=$(stat -c %Y "$CERT" 2>/dev/null)
while true; do
  sleep 5
  cur=$(stat -c %Y "$CERT" 2>/dev/null)
  if [ -n "$cur" ] && [ "$cur" != "$last" ]; then
    last="$cur"
    echo "reload-watcher: certificate changed, reloading nginx"
    nginx -s reload
  fi
done
