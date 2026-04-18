#!/usr/bin/env bash
# Post a deploy notification to Slack with an AI-generated summary.
# Called by deploy-canon.sh after a successful canon deploy.
#
# Usage:
#   notify-deploy.sh              # Normal mode: call Bedrock, post to Slack
#   notify-deploy.sh --dry-run    # Output payload to stdout, no API calls
#
# Environment (read in this order of precedence for the webhook URL):
#   1. $SLACK_DEPLOY_WEBHOOK_URL             — direct env var
#   2. Keychain service `slack-deploy-webhook` for account `mark`
#   3. File at /Users/mark/.secrets/slack-deploy-webhook
#
# Other env vars:
#   SHA         — Git SHA of the deployed commit (defaults to HEAD)
#   BB_VERSION  — version string (defaults to package.json version)
#
# Never use set -x in this script — it would leak secrets to CI logs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export SCRIPT_DIR

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

SHA="${SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"

# --- Version from package.json (top-level, not packages/server) ---
if [[ -z "${BB_VERSION:-}" ]]; then
    BB_VERSION="$(node -p "require('$REPO_ROOT/package.json').version" 2>/dev/null || echo "")"
fi

# --- Resolve webhook URL from env → keychain → file ---
resolve_webhook() {
    if [[ -n "${SLACK_DEPLOY_WEBHOOK_URL:-}" ]]; then
        echo "$SLACK_DEPLOY_WEBHOOK_URL"
        return 0
    fi

    local from_keychain
    if from_keychain=$(security find-generic-password -a mark -s "slack-deploy-webhook" -w 2>/dev/null); then
        if [[ -n "$from_keychain" ]]; then
            echo "$from_keychain"
            return 0
        fi
    fi

    local webhook_file="/Users/mark/.secrets/slack-deploy-webhook"
    if [[ -f "$webhook_file" ]]; then
        cat "$webhook_file"
        return 0
    fi

    return 1
}

if [[ "$DRY_RUN" != "true" ]]; then
    if WEBHOOK_URL=$(resolve_webhook); then
        export SLACK_DEPLOY_WEBHOOK_URL="$WEBHOOK_URL"
    else
        echo "WARNING: No SLACK_DEPLOY_WEBHOOK_URL found (env, keychain service 'slack-deploy-webhook', or /Users/mark/.secrets/slack-deploy-webhook)."
        echo "Skipping Slack notification. To enable:"
        echo "  security add-generic-password -a mark -s slack-deploy-webhook -w '<webhook-url>'"
        echo "or:"
        echo "  echo '<webhook-url>' > /Users/mark/.secrets/slack-deploy-webhook && chmod 600 /Users/mark/.secrets/slack-deploy-webhook"
        exit 0
    fi
fi

# --- Determine previous deploy SHA from git tags (uplift-managed) ---
cd "$REPO_ROOT"
PREV_TAG=""
# Find the most recent tag strictly before HEAD
if PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null); then
    PREV_SHA=$(git rev-parse "$PREV_TAG^{commit}" 2>/dev/null || echo "")
else
    PREV_SHA=""
fi

FIRST_RUN=false

if [[ -z "$PREV_SHA" ]] || [[ "$PREV_SHA" == "$SHA" ]]; then
    FIRST_RUN=true
    echo "No previous tag found — first run, showing last 10 commits"
    MERGES=$(git log --merges --format="%b" -10 HEAD 2>/dev/null || echo "")
    COMMITS=$(git log --no-merges --oneline -10 HEAD 2>/dev/null || echo "")
else
    echo "Previous tag: $PREV_TAG (${PREV_SHA:0:7}) → ${SHA:0:7}"
    MERGES=$(git log --merges --format="%b" "$PREV_SHA".."$SHA" 2>/dev/null | head -30 || echo "")
    COMMITS=$(git log --no-merges --oneline "$PREV_SHA".."$SHA" 2>/dev/null | head -20 || echo "")
fi

# --- Parse changelog via Python ---
CHANGELOG=$(MERGES="$MERGES" COMMITS="$COMMITS" python3 -c "
import os, sys
sys.path.insert(0, os.environ['SCRIPT_DIR'])
from deploy_notify import parse_changelog
print(parse_changelog(os.environ['MERGES'], os.environ['COMMITS']))
" 2>/dev/null) || CHANGELOG=""

if [[ -z "$CHANGELOG" ]]; then
    echo "WARNING: Changelog is empty despite having commits — falling back to raw git log"
    CHANGELOG=$(git log --oneline -10 HEAD 2>/dev/null || echo "deploy notification: changelog unavailable")
fi

echo "Version: ${BB_VERSION:-unknown}"
echo "Changelog:"
echo "$CHANGELOG"
echo "---"

# --- Run deploy_notify.py CLI entrypoint ---
export CHANGELOG SHA BB_VERSION FIRST_RUN DRY_RUN
python3 "$SCRIPT_DIR/deploy_notify.py"
NOTIFY_EXIT=$?

if [[ "$NOTIFY_EXIT" -eq 0 ]]; then
    echo "DEPLOY_NOTIFY_RESULT=posted"
else
    echo "DEPLOY_NOTIFY_RESULT=failed"
fi

exit $NOTIFY_EXIT
