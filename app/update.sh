#!/usr/bin/env bash
# Sunucu güncelleme scripti — production ortamında çalıştırın.
# Kullanım: cd /opt/teamapp/app && bash update.sh
set -e

COMPOSE="docker compose -f docker-compose.yml"

echo "==> Kod güncelleniyor..."
git -C "$(dirname "$0")/.." pull

echo "==> Production image'lar derleniyor (cache bypass)..."
# backend, celery_worker ve celery_beat aynı Dockerfile'ı kullanır;
# üçünü de build etmek gerekir yoksa celery image'ları güncellenmez.
$COMPOSE build --no-cache backend celery_worker celery_beat frontend

echo "==> Servisler yeniden başlatılıyor..."
$COMPOSE up -d

echo "==> Tamamlandı."
$COMPOSE ps
