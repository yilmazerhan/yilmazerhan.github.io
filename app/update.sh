#!/usr/bin/env bash
# Sunucu güncelleme scripti — production ortamında çalıştırın.
# Kullanım: cd /opt/teamapp/app && bash update.sh
set -e

COMPOSE="docker compose -f docker-compose.yml"

echo "==> Kod güncelleniyor..."
git -C "$(dirname "$0")/.." pull

echo "==> Hazır image'lar güncelleniyor (redis, nginx, openssl)..."
# Bu servisler build edilmiyor; pull edilmezlerse güvenlik yamaları hiç gelmez.
$COMPOSE pull redis nginx ssl_init

echo "==> Production image'lar derleniyor (cache bypass)..."
# backend, celery_worker ve celery_beat aynı Dockerfile'ı kullanır;
# üçünü de build etmek gerekir yoksa celery image'ları güncellenmez.
# --pull: base image'ların (python, node, nginx) en güncel yamalı halini çek.
$COMPOSE build --pull --no-cache backend celery_worker celery_beat frontend

echo "==> nginx yapılandırması yeni image ile doğrulanıyor..."
# Geçersiz bir nginx.conf ile yeniden başlatmak siteyi kapatır; önce test et.
if ! $COMPOSE run --rm --no-deps --entrypoint nginx nginx -t; then
    echo "HATA: nginx yapılandırması geçersiz; servisler yeniden başlatılmadı." >&2
    exit 1
fi

echo "==> Servisler yeniden başlatılıyor..."
$COMPOSE up -d

echo "==> Tamamlandı."
$COMPOSE ps
