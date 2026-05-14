#!/bin/bash
# Deployment script for User Manager on Debian 12
set -e

APP_DIR="/opt/user-manager"
APP_USER="usermanager"

echo "=== User Manager — Deployment ==="

# Install system dependencies
echo "[1/5] Installing system packages..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv

# Create app user if not exists
if ! id "$APP_USER" &>/dev/null; then
    echo "[2/5] Creating system user..."
    useradd -r -s /bin/false "$APP_USER"
else
    echo "[2/5] System user already exists"
fi

# Copy application files (preserve existing data files)
echo "[3/5] Copying application files..."
mkdir -p "$APP_DIR"

# Save existing data files before overwrite
for f in config.json locks.json passwords.json mail_queue.json; do
    [ -f "$APP_DIR/$f" ] && cp "$APP_DIR/$f" "/tmp/_um_$f" 2>/dev/null || true
done

cp -r app.py config.py ipa_client.py xlsx_parser.py mail_service.py \
      mail_queue.py glpi_client.py \
      requirements.txt templates/ static/ deploy.sh uninstall.sh "$APP_DIR/"

# Restore data files
for f in config.json locks.json passwords.json mail_queue.json; do
    [ -f "/tmp/_um_$f" ] && mv "/tmp/_um_$f" "$APP_DIR/$f" && echo "  Restored: $f"
done

# Restore backup from uninstall if exists and no current data
BACKUP_DIR="/opt/user-manager-backup"
if [ -d "$BACKUP_DIR" ]; then
    for f in config.json locks.json passwords.json mail_queue.json; do
        if [ ! -f "$APP_DIR/$f" ] && [ -f "$BACKUP_DIR/$f" ]; then
            cp "$BACKUP_DIR/$f" "$APP_DIR/$f"
            echo "  Restored from backup: $f"
        fi
    done
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Create virtual environment and install deps
echo "[4/5] Setting up Python environment..."
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/requirements.txt"

# Create systemd service
echo "[5/5] Creating systemd service..."
cat > /etc/systemd/system/user-manager.service <<EOF
[Unit]
Description=User Manager Web Application
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/venv/bin/gunicorn -b 0.0.0.0:5000 -w 2 --timeout 300 app:app
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable user-manager
systemctl restart user-manager

echo ""
echo "=== Deployment complete ==="
echo "Application is running at http://$(hostname -I | awk '{print $1}'):5000"
echo "Manage with: systemctl {start|stop|restart|status} user-manager"
echo "Logs: journalctl -u user-manager -f"
