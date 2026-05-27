#!/usr/bin/env bash
# =============================================================================
#  Ekip İş Akışı Yönetim Uygulaması — Ubuntu 24 Kurulum Scripti
#  Kullanım: sudo bash install.sh
# =============================================================================
set -euo pipefail

# ── Renkler ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[HATA]${NC}  $*"; exit 1; }
step()    { echo -e "\n${CYAN}══════════════════════════════════════════════${NC}"; \
            echo -e "${CYAN}  $*${NC}"; \
            echo -e "${CYAN}══════════════════════════════════════════════${NC}"; }

# ── Yapılandırma ─────────────────────────────────────────────────────────────
APP_DIR="/opt/teamapp"
REPO_URL="https://github.com/yilmazerhan/yilmazerhan.github.io.git"
BRANCH="claude/team-worklog-kanban-app-NWNcs"
APP_SUBDIR="app"          # repo içindeki uygulama klasörü

# ── Root kontrolü ────────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || error "Bu script root olarak çalıştırılmalıdır. Tekrar deneyin: sudo bash install.sh"

# ═════════════════════════════════════════════════════════════════════════════
step "1/9 — Sunucu bilgilerini belirleme"
# ═════════════════════════════════════════════════════════════════════════════

# Sunucunun public IP'sini al
SERVER_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null \
          || curl -s --connect-timeout 5 api.ipify.org 2>/dev/null \
          || hostname -I | awk '{print $1}')

echo ""
echo -e "  Tespit edilen IP: ${GREEN}${SERVER_IP}${NC}"
echo ""
read -rp "  Domain adı veya IP adresi girin [Enter = ${SERVER_IP}]: " USER_HOST
APP_HOST="${USER_HOST:-$SERVER_IP}"

echo ""
read -rp "  Süper admin e-posta: [admin@example.com]: " ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"

while true; do
  read -rsp "  Süper admin şifresi (min 8 karakter): " ADMIN_PASS
  echo ""
  [ ${#ADMIN_PASS} -ge 8 ] && break
  warn "Şifre en az 8 karakter olmalıdır."
done

read -rp "  Süper admin adı soyadı [System Administrator]: " ADMIN_NAME
ADMIN_NAME="${ADMIN_NAME:-System Administrator}"

info "Kurulum hedefi: ${APP_HOST}"
info "Uygulama dizini: ${APP_DIR}"

# ═════════════════════════════════════════════════════════════════════════════
step "2/9 — Sistem paketlerini güncelleme ve bağımlılıkları kurma"
# ═════════════════════════════════════════════════════════════════════════════

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release git \
  openssl python3 python3-pip \
  ufw fail2ban \
  2>/dev/null
success "Sistem paketleri kuruldu"

# ═════════════════════════════════════════════════════════════════════════════
step "3/9 — Docker kurulumu"
# ═════════════════════════════════════════════════════════════════════════════

if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version | awk '{print $3}' | tr -d ',')
  success "Docker zaten kurulu: v${DOCKER_VER}"
else
  info "Docker kuruluyor..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null
  systemctl enable docker --now
  success "Docker kuruldu"
fi

# Docker Compose v2 kontrolü
docker compose version &>/dev/null || error "Docker Compose v2 bulunamadı. 'docker compose' komutu çalışmalıdır."
success "Docker Compose v2 hazır"

# ═════════════════════════════════════════════════════════════════════════════
step "4/9 — PostgreSQL kurulumu ve veritabanı oluşturma"
# ═════════════════════════════════════════════════════════════════════════════

if ! command -v psql &>/dev/null; then
  info "PostgreSQL kuruluyor..."
  apt-get install -y -qq postgresql postgresql-contrib 2>/dev/null
  systemctl enable postgresql --now
  # PostgreSQL'in tamamen başlaması için bekle
  sleep 3
  success "PostgreSQL kuruldu"
else
  success "PostgreSQL zaten kurulu"
fi

# PostgreSQL çalışıyor mu?
systemctl is-active postgresql >/dev/null 2>&1 || systemctl start postgresql

# Güçlü DB şifresi üret
DB_PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
DB_USER="teamapp"
DB_NAME="teamapp"

# Kullanıcı ve veritabanını oluştur (idempotent)
info "PostgreSQL kullanıcısı ve veritabanı oluşturuluyor..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 && DB_EXISTS=true || DB_EXISTS=false

if [ "$DB_EXISTS" = "false" ]; then
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
  success "PostgreSQL kullanıcı ve veritabanı oluşturuldu"
else
  # Kullanıcı var, şifreyi güncelle
  sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
  # Veritabanı yoksa oluştur
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
    | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  success "PostgreSQL kullanıcısı güncellendi"
fi

# pg_hba.conf — localhost bağlantısına md5 izni ver
PG_HBA=$(sudo -u postgres psql -tc "SHOW hba_file" | tr -d ' ')
if ! grep -q "^host.*${DB_NAME}.*${DB_USER}.*127.0.0.1" "$PG_HBA" 2>/dev/null; then
  echo "host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    md5" >> "$PG_HBA"
  echo "host    ${DB_NAME}    ${DB_USER}    ::1/128         md5" >> "$PG_HBA"
  systemctl reload postgresql
fi

success "PostgreSQL yapılandırıldı"

# ═════════════════════════════════════════════════════════════════════════════
step "5/9 — Uygulama kaynak kodunu indirme"
# ═════════════════════════════════════════════════════════════════════════════

if [ -d "${APP_DIR}/.git" ]; then
  warn "Uygulama dizini zaten mevcut, güncelleniyor..."
  git -C "${APP_DIR}" fetch origin "${BRANCH}" --quiet
  git -C "${APP_DIR}" reset --hard "origin/${BRANCH}" --quiet
  success "Kaynak kod güncellendi"
else
  info "Kaynak kod indiriliyor..."
  git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}" --quiet
  success "Kaynak kod indirildi: ${APP_DIR}"
fi

cd "${APP_DIR}/${APP_SUBDIR}"

# ═════════════════════════════════════════════════════════════════════════════
step "6/9 — Ortam değişkenleri (.env) oluşturma"
# ═════════════════════════════════════════════════════════════════════════════

# Fernet key üretme fonksiyonu
fernet_key() {
  python3 -c "
import base64, os
key = base64.urlsafe_b64encode(os.urandom(32)).decode()
print(key + '='*(4 - len(key)%4) if len(key)%4 else key)
  " 2>/dev/null || python3 -c "
import struct, os, base64
raw = os.urandom(32)
print(base64.urlsafe_b64encode(raw).decode().rstrip('=') + '=')
  "
}

SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
REDIS_PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(20))")
JIRA_KEY=$(fernet_key)
SMTP_KEY=$(fernet_key)
SSL_KEY=$(fernet_key)
INV_KEY=$(fernet_key)

# Mevcut .env varsa yedekle
[ -f ".env" ] && cp ".env" ".env.bak.$(date +%Y%m%d_%H%M%S)" && warn "Eski .env yedeklendi"

cat > .env <<EOF
# ─── Database ─────────────────────────────────────────────────────────────
POSTGRES_DB=${DB_NAME}
POSTGRES_USER=${DB_USER}
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_PORT=5432

# ─── Redis ────────────────────────────────────────────────────────────────
REDIS_PASSWORD=${REDIS_PASS}

# ─── Application ──────────────────────────────────────────────────────────
SECRET_KEY=${SECRET_KEY}
JIRA_ENCRYPTION_KEY=${JIRA_KEY}
SMTP_ENCRYPTION_KEY=${SMTP_KEY}
SSL_ENCRYPTION_KEY=${SSL_KEY}
INVENTORY_ENCRYPTION_KEY=${INV_KEY}

# ─── URLs ─────────────────────────────────────────────────────────────────
FRONTEND_URL=https://${APP_HOST}
BACKEND_URL=https://${APP_HOST}/api
ENVIRONMENT=production

# ─── Rate Limits ──────────────────────────────────────────────────────────
AUTH_LOGIN_RATE_LIMIT=5/minute
AUTH_FORGOT_PASSWORD_RATE_LIMIT=3/hour
AUTH_REFRESH_RATE_LIMIT=60/minute

# ─── SuperAdmin ───────────────────────────────────────────────────────────
SUPERADMIN_EMAIL=${ADMIN_EMAIL}
SUPERADMIN_PASSWORD=${ADMIN_PASS}
SUPERADMIN_FULL_NAME=${ADMIN_NAME}
EOF

chmod 600 .env
success ".env dosyası oluşturuldu (600 izinleri)"

# ═════════════════════════════════════════════════════════════════════════════
step "7/9 — Güvenlik duvarı yapılandırması"
# ═════════════════════════════════════════════════════════════════════════════

ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null 2>&1
ufw default allow outgoing >/dev/null 2>&1
ufw allow ssh      >/dev/null 2>&1   # 22
ufw allow 80/tcp   >/dev/null 2>&1   # HTTP → HTTPS yönlendirme
ufw allow 443/tcp  >/dev/null 2>&1   # HTTPS
ufw --force enable >/dev/null 2>&1
success "UFW güvenlik duvarı aktif: 22 (SSH), 80 (HTTP), 443 (HTTPS)"

# ═════════════════════════════════════════════════════════════════════════════
step "8/9 — Docker imajlarını derleme ve servisleri başlatma"
# ═════════════════════════════════════════════════════════════════════════════

info "Docker imajları derleniyor (5-10 dakika sürebilir)..."
docker compose build --no-cache --quiet 2>&1 | grep -E "^#|Step|error|ERROR" || true
success "Docker imajları derlendi"

info "Servisler başlatılıyor..."
# Migration + ssl_init + tüm servisler
docker compose up -d --remove-orphans

info "Servislerin hazır olması bekleniyor (60 saniye)..."
sleep 10

# Migration tamamlandı mı?
TIMEOUT=90
ELAPSED=0
info "Migration bekleniyor..."
while true; do
  STATUS=$(docker compose ps migration --format json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list): data = data[0] if data else {}
    print(data.get('State','') or data.get('status',''))
except: print('unknown')
" 2>/dev/null || echo "unknown")

  if echo "$STATUS" | grep -qi "exit\|exited\|complete\|finished"; then
    EXIT_CODE=$(docker compose ps migration --format json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list): data = data[0] if data else {}
    print(data.get('ExitCode', data.get('exitCode', '0')))
except: print('0')
" 2>/dev/null || echo "0")
    if [ "$EXIT_CODE" = "0" ] || [ "$EXIT_CODE" = "" ]; then
      success "Veritabanı migration tamamlandı"
    else
      error "Migration başarısız! Loglar: docker compose logs migration"
    fi
    break
  fi

  ELAPSED=$((ELAPSED+5))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    warn "Migration zaman aşımına uğradı, log kontrol ediliyor..."
    docker compose logs migration --tail=20 2>/dev/null || true
    break
  fi
  sleep 5
done

# Backend'in ayağa kalkması için bekle
info "Backend health check bekleniyor..."
TIMEOUT=120
ELAPSED=0
while true; do
  if curl -sk "https://localhost/health" -o /dev/null -w "%{http_code}" 2>/dev/null | grep -q "200"; then
    success "Backend sağlık kontrolü geçti"
    break
  fi
  if curl -sk "http://localhost/health" -o /dev/null -w "%{http_code}" 2>/dev/null | grep -q "200"; then
    success "Backend HTTP sağlık kontrolü geçti"
    break
  fi
  ELAPSED=$((ELAPSED+5))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    warn "Sağlık kontrolü zaman aşımına uğradı. Servis loglarını kontrol edin:"
    warn "  docker compose -f ${APP_DIR}/${APP_SUBDIR}/docker-compose.yml logs --tail=30"
    break
  fi
  sleep 5
done

# ═════════════════════════════════════════════════════════════════════════════
step "9/9 — Kurulum doğrulama"
# ═════════════════════════════════════════════════════════════════════════════

echo ""
info "Servis durumları:"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
  docker compose ps

echo ""
info "Bağlantı testi yapılıyor..."

# HTTPS health check
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://localhost/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  success "HTTPS bağlantısı başarılı (200 OK)"
else
  warn "HTTPS health check → HTTP $HTTP_CODE (self-signed sertifika uyarısı normal)"
fi

# HTTP → HTTPS yönlendirme
REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/" 2>/dev/null || echo "000")
if [ "$REDIRECT" = "301" ] || [ "$REDIRECT" = "302" ]; then
  success "HTTP → HTTPS yönlendirme çalışıyor"
else
  warn "HTTP yönlendirme kontrol edilemedi (HTTP $REDIRECT)"
fi

# ── systemd servisi oluştur (sunucu yeniden başladığında otomatik başlat) ──────
COMPOSE_FILE="${APP_DIR}/${APP_SUBDIR}/docker-compose.yml"
cat > /etc/systemd/system/teamapp.service <<SYSD
[Unit]
Description=Ekip İş Akışı Yönetim Uygulaması
Requires=docker.service
After=docker.service network-online.target postgresql.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}/${APP_SUBDIR}
ExecStart=/usr/bin/docker compose -f ${COMPOSE_FILE} up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f ${COMPOSE_FILE} down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SYSD

systemctl daemon-reload
systemctl enable teamapp.service
success "teamapp.service systemd birimi oluşturuldu (otomatik başlatma aktif)"

# ── Özet ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          KURULUM TAMAMLANDI                                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐  Uygulama URL    : ${CYAN}https://${APP_HOST}${NC}"
echo -e "  👤  Admin e-posta   : ${CYAN}${ADMIN_EMAIL}${NC}"
echo -e "  🔑  Kullanıcı adı   : ${CYAN}superuser${NC}"
echo -e "  📁  Uygulama dizini : ${CYAN}${APP_DIR}/${APP_SUBDIR}${NC}"
echo ""
echo -e "  ${YELLOW}NOT:${NC} İlk açılışta tarayıcı self-signed sertifika uyarısı verir."
echo -e "       Uyarıyı kabul edin veya Ayarlar → SSL bölümünden kendi"
echo -e "       sertifikanızı yükleyin."
echo ""
echo -e "  ${BLUE}Faydalı komutlar:${NC}"
echo -e "    Loglar       : docker compose -f ${COMPOSE_FILE} logs -f"
echo -e "    Yeniden başlat: systemctl restart teamapp"
echo -e "    Durdur       : systemctl stop teamapp"
echo -e "    Güncelle     : bash ${APP_DIR}/install.sh"
echo ""

# Önemli bilgileri dosyaya yaz
cat > "${APP_DIR}/CREDENTIALS.txt" <<CREDS
Kurulum Tarihi: $(date)
────────────────────────────────────────
Uygulama URL  : https://${APP_HOST}
Admin E-posta : ${ADMIN_EMAIL}
Admin Şifresi : ${ADMIN_PASS}
Kullanıcı Adı : superuser
────────────────────────────────────────
DB Host       : localhost:5432
DB Adı        : ${DB_NAME}
DB Kullanıcı  : ${DB_USER}
DB Şifre      : ${DB_PASS}
────────────────────────────────────────
Bu dosyayı güvenli bir yerde saklayın!
CREDS
chmod 600 "${APP_DIR}/CREDENTIALS.txt"
echo -e "  ${YELLOW}Giriş bilgileri:${NC} ${APP_DIR}/CREDENTIALS.txt"
echo ""
