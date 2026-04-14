# Running BlueBubbles Server Headless on macOS

## Executive Summary

True headless (LaunchDaemon, no user login) is NOT possible. Three hard blockers:

1. **Electron requires WindowServer** -- even in headless mode, calls CoreGraphics/AppKit. No Xvfb on macOS.
2. **AppleScript requires Aqua session** -- BB's iMessage sending uses `tell application "Messages"` and `tell application "System Events"`
3. **Messages.app/imagent is user-session bound** -- even Private API requires Messages.app in a logged-in user context

## Architecture Analysis

- `packages/server/src/server/index.ts` preChecks() line 795 calls `this.window.minimize()` with no null guard -- crashes in headless mode (upstream #789)
- `packages/server/src/windows/AppWindow.ts` build() skips BrowserWindow when headless config is set, leaving Server().window as null
- `packages/server/src/server/fileSystem/index.ts` createLaunchAgent() uses `launchctl bootstrap gui/<uid>` -- explicitly targets GUI user session
- `packages/server/src/server/api/apple/scripts.ts` all iMessage sending uses osascript with `tell application "Messages"` and `tell application "System Events"` -- requires Aqua session
- `packages/server/src/main.ts` Electron entry point requires app.whenReady() -- needs WindowServer

## Known Issues

- Headless mode + Always Start via Terminal = broken (upstream #733) -- services never initialize
- start_via_terminal + launchd parent detection creates restart loop
- Docker/containers not viable -- iMessage requires macOS + Messages.app (upstream #762)
- Electron --headless flag suppresses window but does NOT bypass WindowServer
- LSUIElement already used by BB in headless mode (no Dock icon)
- Service manager PR #707 attempted proper dependency management -- closed, never merged
- Electron Tahoe GPU overload fix needed (electron PRs #48376, #48399, #48400)

## What Actually Works

The proven pattern (confirmed by Apple DTS engineers, BB community, and openclaw-infra deployment):

1. Disable FileVault (non-negotiable for auto-login)
2. Enable auto-login for target user account
3. LaunchAgent at ~/Library/LaunchAgents/ (NOT LaunchDaemon)
4. `sudo pmset -a sleep 0` to prevent all sleep
5. Software virtual display (BetterDummy) or HDMI dummy plug -- prevents GPU/WindowServer degradation
6. Screen Sharing enabled for remote management
7. SSH for command-line management (but cannot replace the GUI session)

## Why LaunchDaemon Cannot Work

- LaunchDaemon runs at system boot, root-level, ZERO WindowServer access
- LaunchAgent runs after user login, HAS GUI access
- Electron's native code calls CoreGraphics/AppKit at startup regardless of headless flag
- AppleScript targeting GUI apps doesn't work from non-GUI context
- Apple DTS engineer quote: "There is no solution that'll work with FileVault"

## Sources

- BlueBubbles autostart docs: https://docs.bluebubbles.app/server/basic-guides/autostart-server-after-crash
- Upstream issue #789: headless null window crash
- Upstream issue #733: headless + terminal startup broken
- Upstream issue #762: Docker/container request (not viable)
- Apple Developer Forums thread 737381: headless Mac server constraints
- Electron issue #29164: headless without Xvfb
- The Eclectic Light Company: LaunchDaemon vs LaunchAgent guide
- BetterDummy: https://github.com/ZhipingYang/BetterDummy
