#!/usr/bin/env bash
# Güvenlik güncelleme scripti — production sunucusunda root olarak çalıştırın.
#
#   cd /opt/teamapp/app && bash security-update.sh          # rapor + uygulama güncellemesi
#   cd /opt/teamapp/app && bash security-update.sh --host   # + işletim sistemi/Docker paketleri
#   cd /opt/teamapp/app && bash security-update.sh --check  # yalnızca rapor, hiçbir şey değiştirmez
#
# Uygulama tarafı (Python/JS bağımlılıkları, nginx/redis image'ları) update.sh ile
# güncellenir. --host, apt ile sunucu paketlerini (Docker Engine, runc, containerd,
# OpenSSL, kernel...) yükseltir; Docker daemon'ı yeniden başlayabileceği için tüm
# konteynerler kısa süre kapanır, bu yüzden varsayılan olarak çalışmaz.
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.yml"
MODE="app"
case "${1:-}" in
    --host)  MODE="host" ;;
    --check) MODE="check" ;;
    "")      ;;
    *) echo "Kullanım: $0 [--host|--check]" >&2; exit 2 ;;
esac

WARN=0
ok()   { echo "  [OK]    $*"; }
warn() { echo "  [UYARI] $*"; WARN=$((WARN + 1)); }
info() { echo "  [BİLGİ] $*"; }

# version_lt A B → A < B (sürüm sıralaması)
version_lt() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ]; }

report() {
    echo "==> Sunucu"
    . /etc/os-release 2>/dev/null && info "İşletim sistemi: ${PRETTY_NAME:-?}, kernel $(uname -r)"
    if [ -f /var/run/reboot-required ]; then
        warn "Bekleyen yeniden başlatma var (/var/run/reboot-required) — yeni kernel/kütüphaneler ancak reboot ile devreye girer."
    fi
    if command -v apt-get >/dev/null 2>&1; then
        local sec
        sec=$(apt-get -s -o Debug::NoLocking=1 upgrade 2>/dev/null | grep -c '^Inst .*-security' || true)
        if [ "${sec:-0}" -gt 0 ]; then
            warn "$sec güvenlik paketi güncellenmeyi bekliyor (--host ile uygulanır)."
        else
            ok "Bekleyen güvenlik paketi yok (son 'apt-get update' bilgisine göre)."
        fi
    fi

    echo "==> Docker"
    info "Docker Engine: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?')"
    local runc_v
    runc_v=$(runc --version 2>/dev/null | awk '/^runc version/{print $3}' || true)
    if [ -n "$runc_v" ]; then
        # CVE-2025-31133 / 52565 / 52881 (konteynerden host'a kaçış) 1.2.8 ve 1.3.3'te düzeltildi.
        if { version_lt "$runc_v" "1.2.8"; } || { [[ "$runc_v" == 1.3.* ]] && version_lt "$runc_v" "1.3.3"; }; then
            warn "runc $runc_v konteyner kaçış açıklarına (CVE-2025-31133/52565/52881) açık — --host ile güncelleyin."
        else
            ok "runc $runc_v"
        fi
    fi

    echo "==> Uygulama konteynerleri"
    if ! $COMPOSE ps --status running --services >/dev/null 2>&1; then
        warn "docker compose çalıştırılamadı."
        return
    fi
    local v
    v=$($COMPOSE exec -T nginx nginx -v 2>&1 | grep -o 'nginx/[0-9.]*' || true)
    case "$v" in
        nginx/1.30.*|nginx/1.3[1-9].*) ok "Reverse proxy $v" ;;
        "") warn "nginx konteyneri çalışmıyor." ;;
        *) warn "Reverse proxy $v — destek dışı sürüm; uygulama güncellemesi 1.30'a taşır." ;;
    esac
    v=$($COMPOSE exec -T frontend nginx -v 2>&1 | grep -o 'nginx/[0-9.]*' || true)
    case "$v" in
        nginx/1.30.*|nginx/1.3[1-9].*) ok "Frontend $v" ;;
        "") warn "frontend konteyneri çalışmıyor." ;;
        *) warn "Frontend $v — destek dışı sürüm; uygulama güncellemesi 1.30'a taşır." ;;
    esac
    v=$($COMPOSE exec -T redis redis-server --version 2>/dev/null | grep -o 'v=[0-9.]*' || true)
    [ -n "$v" ] && info "Redis ${v#v=}"
    v=$($COMPOSE exec -T backend python -c "
import importlib.metadata as m
print(' '.join(f'{p}={m.version(p)}' for p in ('fastapi','starlette','PyJWT','cryptography','certifi')))
" 2>/dev/null || true)
    if [ -n "$v" ]; then
        info "Backend: $v"
        local starlette jwt
        starlette=$(echo "$v" | grep -o 'starlette=[0-9.]*' | cut -d= -f2)
        jwt=$(echo "$v" | grep -o 'PyJWT=[0-9.]*' | cut -d= -f2)
        if version_lt "${starlette:-0}" "1.3.1" || version_lt "${jwt:-0}" "2.15.0"; then
            warn "Backend bilinen açıklara sahip paketlerle çalışıyor (starlette<1.3.1 / PyJWT<2.15.0) — uygulama güncellemesi gerekli."
        fi
    else
        warn "backend konteyneri çalışmıyor."
    fi
    echo "==> Image yaşları"
    $COMPOSE ps --format '{{.Name}} {{.Image}}' 2>/dev/null | while read -r name image; do
        created=$(docker image inspect --format '{{.Created}}' "$image" 2>/dev/null | cut -c1-10)
        info "$name → $image (oluşturulma: ${created:-?})"
    done
}

verify() {
    echo "==> Doğrulama"
    local url
    url=$(grep -E '^FRONTEND_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
    url=${url:-https://localhost}
    for _ in $(seq 1 30); do
        if $COMPOSE exec -T backend curl -fs http://localhost:8000/health >/dev/null 2>&1; then break; fi
        sleep 2
    done
    if curl -fsk -m 10 "$url/health" >/dev/null; then ok "$url/health yanıt veriyor"; else warn "$url/health yanıt vermiyor"; fi
    if curl -fsk -m 10 "$url/.well-known/oauth-authorization-server" | grep -q '"issuer"'; then
        ok "MCP OAuth keşif belgesi yayında"
    else
        warn "MCP OAuth keşif belgesi JSON döndürmüyor (nginx yapılandırmasını kontrol edin)"
    fi
    if curl -sk -m 10 -D- -o /dev/null "$url/" | grep -qi '^strict-transport-security'; then
        ok "Güvenlik başlıkları (HSTS) mevcut"
    else
        warn "HSTS başlığı yok"
    fi
}

if [ "$(id -u)" -ne 0 ] && ! docker info >/dev/null 2>&1; then
    echo "Bu script root olarak (veya docker grubunda) çalıştırılmalı." >&2
    exit 1
fi

echo "################ ÖNCE ################"
report

if [ "$MODE" = "check" ]; then
    echo; echo "Yalnızca rapor modu: hiçbir şey değiştirilmedi. Uyarı sayısı: $WARN"
    exit 0
fi

if [ "$MODE" = "host" ]; then
    echo; echo "==> Sunucu paketleri güncelleniyor (Docker daemon yeniden başlayabilir)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q
    apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
fi

echo; echo "==> Uygulama güncelleniyor (update.sh)..."
bash ./update.sh

WARN=0
echo; echo "################ SONRA ################"
report
verify

echo
if [ -f /var/run/reboot-required ]; then
    echo "NOT: Sunucunun yeniden başlatılması gerekiyor (yeni kernel/kütüphaneler). Uygun bir zamanda 'reboot' yapın."
fi
if [ "$WARN" -eq 0 ]; then
    echo "Tamamlandı: uyarı yok."
else
    echo "Tamamlandı: $WARN uyarı var — yukarıdaki [UYARI] satırlarına bakın."
fi
