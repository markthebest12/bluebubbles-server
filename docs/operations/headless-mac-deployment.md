# BlueBubbles Server: Headless Mac Deployment Guide

## Prerequisites

- macOS 14+ (Sonoma, Sequoia, or Tahoe)
- Mac Mini with auto-login configured
- FileVault DISABLED
- Network access (SSH + Screen Sharing)

## Setup Checklist

1. Disable FileVault: `sudo fdesetup disable`
2. Enable auto-login: System Settings > Users & Groups > Automatic Login
3. Disable sleep: `sudo pmset -a sleep 0 displaysleep 0 disksleep 0`
4. Install BetterDummy or HDMI dummy plug for virtual display
5. Enable Screen Sharing: System Settings > General > Sharing > Screen Sharing
6. Enable SSH: System Settings > General > Sharing > Remote Login
7. Install BlueBubbles Server (from source or DMG)

## LaunchAgent Setup

Create `~/Library/LaunchAgents/com.bluebubbles.server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bluebubbles.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/BlueBubbles.app/Contents/MacOS/BlueBubbles</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/bluebubbles.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/bluebubbles.stderr.log</string>
</dict>
</plist>
```

Load with:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.bluebubbles.server.plist
```

## Gotchas & Known Issues

### FileVault + Auto-Login

FileVault MUST be disabled. There is no workaround. FileVault encrypts the boot volume and requires user authentication before the OS fully loads -- auto-login cannot work.

### No True Headless Mode

BlueBubbles CANNOT run as a LaunchDaemon (system-level service). It requires a user GUI session because:

- Electron needs WindowServer for process initialization
- AppleScript iMessage commands need the Aqua session
- Messages.app/imagent daemon is user-session bound

See `docs/research/2026-04-14-headless-operation.md` for full architectural analysis.

### Headless Mode + Terminal Startup

Do NOT enable both "Headless mode" and "Always Start via Terminal" simultaneously -- this is a known broken combination (upstream #733). Services fail to initialize. Use one or the other.

### HDMI Dummy / Virtual Display

Without a connected display (or dummy), macOS restricts GPU features and resolution. This can cause:

- Degraded Screen Sharing performance
- WindowServer issues
- GPU feature availability problems

Use BetterDummy (software, free, Apple Silicon compatible) or an HDMI dummy plug ($10-15).

### Sleep Prevention

Even with auto-login, macOS may sleep the machine. Use:

```bash
sudo pmset -a sleep 0 displaysleep 0 disksleep 0
caffeinate -s &  # belt and suspenders
```

### Gateway Restart Error Noise

When OpenClaw gateways restart, BlueBubbles generates transient webhook delivery errors. These are noise -- the gateway is temporarily unavailable. See issue for retry/backoff improvement.

### Electron on macOS 26 Tahoe

Electron apps can cause WindowServer GPU overload on Tahoe due to cornerMask API. Ensure Electron is updated (upstream fixes in electron PRs #48376, #48400).

## Remote Management

- **SSH**: `ssh user@hostname` for CLI operations
- **Screen Sharing**: `vnc://hostname` for GUI access (required for some BB settings)
- **BB API**: `http://hostname:1234` for direct API access

## Monitoring

Check BB server health:

```bash
curl http://localhost:1234/api/v1/server/info
```

Check LaunchAgent status:

```bash
launchctl print gui/$(id -u)/com.bluebubbles.server
```

Logs: Check BB's built-in logging or stdout from LaunchAgent at `/tmp/bluebubbles.stdout.log`.
