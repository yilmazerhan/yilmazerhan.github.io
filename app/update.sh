#!/usr/bin/env bash
# Sunucu güncelleme scripti — production ortamında çalıştırın.
# Kullanım: cd /opt/teamapp/app && bash update.sh
set -e

COMPOSE="docker compose -f docker-compose.yml"

echo "==> Kod güncelleniyor..."
git -C "$(dirname "$0")/.." pull

echo "==> Production image'lar derleniyor (cache bypass)..."
$COMPOSE build --no-cache migration backend frontend

echo "==> Migration çalıştırılıyor..."
$COMPOSE run --rm migration

echo "==> Servisler yeniden başlatılıyor..."
$COMPOSE up -d

echo "==> Tamamlandı."
$COMPOSE ps
