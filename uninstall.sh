#!/bin/bash
set -e

APP_DIR="/opt/user-manager"
APP_USER="usermanager"
SERVICE="user-manager"

echo "=== User Manager — Uninstall ==="

echo "[1/4] Stopping service..."
systemctl stop "$SERVICE" 2>/dev/null || true
systemctl disable "$SERVICE" 2>/dev/null || true

echo "[2/4] Removing systemd unit..."
rm -f "/etc/systemd/system/${SERVICE}.service"
systemctl daemon-reload

echo "[3/4] Removing application directory..."
rm -rf "$APP_DIR"

echo "[4/4] Removing system user..."
userdel "$APP_USER" 2>/dev/null || true

echo ""
echo "=== Uninstall complete ==="
