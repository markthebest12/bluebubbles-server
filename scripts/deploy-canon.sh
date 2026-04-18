#!/bin/bash
set -euo pipefail

# deploy-canon.sh — Build and deploy BB fork to /Applications/BlueBubbles.app
#
# Builds from /opt/bluebubbles-server on canon, backs up the current app,
# replaces it with the fork build.
#
# Usage:
#   ./scripts/deploy-canon.sh          # build + deploy
#   ./scripts/deploy-canon.sh rollback # restore previous version
#
# After deploy, you must manually restart BB via the UI for each user
# (gaston and colette).

REPO="/opt/bluebubbles-server"
APP_DEST="/Applications/BlueBubbles.app"
BACKUP_DIR="/opt/bluebubbles-server/.backups"
BUILD_OUTPUT="$REPO/packages/server/releases"

source ~/.zshrc 2>/dev/null || true

# --- Rollback mode ---
if [[ "${1:-}" == "rollback" ]]; then
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | head -1)
    if [[ -z "$LATEST_BACKUP" ]]; then
        echo "ERROR: No backups found in $BACKUP_DIR"
        exit 1
    fi
    echo "=== ROLLBACK ==="
    echo "Restoring from: $LATEST_BACKUP"
    echo ""
    echo "WARNING: You must quit BlueBubbles for ALL users before proceeding."
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi

    rm -rf "$APP_DEST"
    cd /Applications && tar xzf "$LATEST_BACKUP"
    echo "Restored $APP_DEST from backup."
    echo ""
    echo "NEXT: Restart BlueBubbles for each user via the UI."
    exit 0
fi

# --- Build + Deploy mode ---
echo "=== BlueBubbles Fork Deploy ==="
echo "Repo:    $REPO"
echo "Target:  $APP_DEST"
echo ""

# 1. Pull latest
echo "--- Step 1: Pull latest ---"
cd "$REPO"
git pull origin main
echo "Version: $(node -p "require('./package.json').version")"
echo "Commit:  $(git rev-parse --short HEAD)"
echo ""

# 2. Install deps (skip scripts, then electron-rebuild)
echo "--- Step 2: Install dependencies ---"
npm install --ignore-scripts 2>&1 | tail -3
npx electron-rebuild -f better-sqlite3 node-mac-contacts node-mac-permissions 2>&1 | tail -3
echo ""

# 3. Build (skip type checker due to upstream Buffer errors)
echo "--- Step 3: Build ---"
node scripts/build-no-typecheck.js
echo ""

# 4. Package with electron-builder
echo "--- Step 4: Package ---"
cd packages/server
npx electron-builder build --mac --publish never --config ./scripts/electron-builder-config.js 2>&1 | tail -10
cd "$REPO"
echo ""

# 5. Find the built .app
BUILT_APP=$(find "$BUILD_OUTPUT" -name "BlueBubbles.app" -maxdepth 3 2>/dev/null | head -1)
if [[ -z "$BUILT_APP" ]]; then
    # electron-builder might use a different name or location
    BUILT_APP=$(find "$REPO/packages/server/dist" -name "*.app" -maxdepth 2 2>/dev/null | head -1)
fi
if [[ -z "$BUILT_APP" ]]; then
    echo "ERROR: Built .app not found in $BUILD_OUTPUT or packages/server/dist"
    echo "Contents of releases dir:"
    ls -la "$BUILD_OUTPUT" 2>/dev/null || echo "(dir does not exist)"
    exit 1
fi
echo "Built app: $BUILT_APP"
echo ""

# 6. Backup current app
echo "--- Step 5: Backup current app ---"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/BlueBubbles-$TIMESTAMP.tar.gz"
cd /Applications && tar czf "$BACKUP_FILE" BlueBubbles.app
echo "Backed up to: $BACKUP_FILE"
echo ""

# 7. Replace
echo "--- Step 6: Replace app ---"
echo ""
echo "WARNING: You must quit BlueBubbles for ALL users before proceeding."
echo "  - Quit gaston's BB instance (port 1234)"
echo "  - Quit colette's BB instance (port 1235)"
echo ""
read -p "Have you quit both instances? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted. Backup saved at $BACKUP_FILE"
    echo "Re-run this script when ready."
    exit 0
fi

rm -rf "$APP_DEST"
cp -R "$BUILT_APP" "$APP_DEST"
chmod -R a+rX "$APP_DEST"
echo "Deployed $APP_DEST"
echo ""

cd "$REPO"
DEPLOYED_VERSION="$(node -p "require('./package.json').version")"
DEPLOYED_SHA="$(git rev-parse HEAD)"

echo "=== Deploy Complete ==="
echo "Version: $DEPLOYED_VERSION"
echo "Commit:  ${DEPLOYED_SHA:0:7}"
echo "Backup:  $BACKUP_FILE"
echo ""

# --- Step 7: Slack notification (non-fatal on failure) ---
echo "--- Step 7: Notify Slack ---"
if SHA="$DEPLOYED_SHA" BB_VERSION="$DEPLOYED_VERSION" \
    bash "$REPO/scripts/notify-deploy.sh"; then
    echo "Notification posted."
else
    echo "Notification failed — see output above. Deploy itself is complete."
fi
echo ""

echo "NEXT STEPS:"
echo "  1. Start BlueBubbles for gaston (login as gaston, open BlueBubbles)"
echo "  2. Start BlueBubbles for colette (login as colette, open BlueBubbles)"
echo "  3. Verify both instances are running:"
echo "     curl http://localhost:1234/api/v1/server/info"
echo "     curl http://localhost:1235/api/v1/server/info"
echo ""
echo "TO ROLLBACK:"
echo "  ./scripts/deploy-canon.sh rollback"
