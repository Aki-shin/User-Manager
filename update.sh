#!/bin/bash
# Update script — copies all app files to /opt/user-manager and restarts
set -e

APP_DIR="/opt/user-manager"

echo "Copying files..."
cp app.py config.py ipa_client.py xlsx_parser.py mail_service.py "$APP_DIR/"
cp -r templates/ "$APP_DIR/templates/"
cp -r static/ "$APP_DIR/static/"

echo "Restarting service..."
systemctl restart user-manager

echo "Done. Check: journalctl -u user-manager -f"
