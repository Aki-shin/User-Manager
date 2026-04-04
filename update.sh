#!/bin/bash
# Update script — copies all app files to /opt/user-manager and restarts
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="/opt/user-manager"

echo "Copying from $SCRIPT_DIR to $APP_DIR..."

# Python files
for f in app.py config.py ipa_client.py xlsx_parser.py mail_service.py requirements.txt; do
    if [ -f "$SCRIPT_DIR/$f" ]; then
        cp "$SCRIPT_DIR/$f" "$APP_DIR/$f"
        echo "  $f"
    fi
done

# Templates
mkdir -p "$APP_DIR/templates"
for f in "$SCRIPT_DIR"/templates/*.html; do
    [ -f "$f" ] && cp "$f" "$APP_DIR/templates/" && echo "  templates/$(basename $f)"
done

# Static CSS
mkdir -p "$APP_DIR/static/css"
for f in "$SCRIPT_DIR"/static/css/*.css; do
    [ -f "$f" ] && cp "$f" "$APP_DIR/static/css/" && echo "  static/css/$(basename $f)"
done

# Static JS
mkdir -p "$APP_DIR/static/js"
for f in "$SCRIPT_DIR"/static/js/*.js; do
    [ -f "$f" ] && cp "$f" "$APP_DIR/static/js/" && echo "  static/js/$(basename $f)"
done

echo ""
echo "Verifying key files..."
grep -c "filterUsers" "$APP_DIR/static/js/users.js" > /dev/null && echo "  users.js: OK (search present)" || echo "  users.js: FAIL"
grep -c "sync-search" "$APP_DIR/templates/sync.html" > /dev/null && echo "  sync.html: OK (search present)" || echo "  sync.html: FAIL"
grep -c "user-search" "$APP_DIR/templates/index.html" > /dev/null && echo "  index.html: OK (search present)" || echo "  index.html: FAIL"
grep -c "toggleAllUpdatesCheckbox" "$APP_DIR/static/js/sync.js" > /dev/null && echo "  sync.js: OK (checkbox handlers present)" || echo "  sync.js: FAIL"

echo ""
echo "Restarting service..."
systemctl restart user-manager

echo "Done. Check: journalctl -u user-manager -f"
