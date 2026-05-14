#!/bin/bash
set -e

APP_DIR="/opt/user-manager"
APP_USER="usermanager"
SERVICE="user-manager"

echo "=== User Manager — Uninstall ==="

# Ask about data preservation
read -p "Сохранить базу данных и настройки? (y/n): " KEEP_DATA

echo "[1/4] Stopping service..."
systemctl stop "$SERVICE" 2>/dev/null || true
systemctl disable "$SERVICE" 2>/dev/null || true

echo "[2/4] Removing systemd unit..."
rm -f "/etc/systemd/system/${SERVICE}.service"
systemctl daemon-reload

if [ "$KEEP_DATA" = "y" ] || [ "$KEEP_DATA" = "Y" ]; then
    echo "[3/4] Removing application (keeping data)..."
    BACKUP_DIR="/opt/user-manager-backup"
    mkdir -p "$BACKUP_DIR"
    for f in config.json locks.json passwords.json mail_queue.json; do
        [ -f "$APP_DIR/$f" ] && cp "$APP_DIR/$f" "$BACKUP_DIR/$f" && echo "  Saved: $BACKUP_DIR/$f"
    done
    rm -rf "$APP_DIR"
    echo "  Data saved in $BACKUP_DIR/"
else
    echo "[3/4] Removing application with all data..."
    rm -rf "$APP_DIR"
fi

echo "[4/4] Removing system user..."
userdel "$APP_USER" 2>/dev/null || true

echo ""
echo "=== Uninstall complete ==="
