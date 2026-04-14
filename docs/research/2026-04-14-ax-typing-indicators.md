# Accessibility API Typing Indicators — Research Results

**Date:** 2026-04-14
**Issue:** #20
**Status:** Prototype successful, pending manual verification of typing indicator trigger

## Background

macOS 26 Tahoe killed Private API typing indicators. The DYLIB injection path used to hook into `imagent` is blocked by Launch Constraints (kernel-enforced, no bypass). XPC to `imagent` requires Apple-private entitlements. We need an alternative.

The hypothesis: the macOS Accessibility API (`AXUIElement`) can interact with Messages.app's compose text field without injection or private entitlements, and setting text in that field may trigger a typing indicator on the remote end.

## Prototype Results

### What Works

| Capability | Result | Performance |
|-----------|--------|-------------|
| Find compose field by identifier (`messageBodyField`) | 10/10 | avg 12ms |
| Find compose field by placeholder (`iMessage`) | 10/10 | avg 5.7ms |
| Focus compose field | 10/10 | avg 0.2ms |
| Set text in compose field | 10/10 | avg 0.3ms |
| Full cycle (focus + set + clear) | 10/10 | avg 1.9ms |
| **Background operation** (Messages.app not foreground) | **YES** | — |

### Key Findings

1. **No foreground requirement.** AX operations work with Messages.app in the background. The window does not need to be visible or active. This is critical for headless/background server operation.

2. **Sub-millisecond individual operations.** Focus and SetValue each take < 1ms. Even the full cycle is under 5ms worst case.

3. **Element discovery is reliable.** The compose field is consistently identifiable via `AXIdentifier = "messageBodyField"` or `AXPlaceholderValue = "iMessage"`. The identifier-based search is slightly slower (12ms avg vs 5.7ms) because it does a deeper tree walk.

4. **Message bubbles are also accessible.** Existing messages appear as `AXTextArea` elements with `id = "CKBalloonTextView"`. This could enable reading message content via AX as a fallback if the `attributedBody` decoder fails.

5. **No injection required.** This uses only public macOS Accessibility APIs. No SIP bypass, no DYLIB injection, no private entitlements.

## What Needs Manual Verification

**The critical unknown: does `AXUIElementSetAttributeValue` on the compose field trigger a typing indicator on the remote end?**

There are two possible outcomes:

### Scenario A: SetValue triggers typing indicator
This is the ideal case. Messages.app internally fires a typing notification to the remote conversation when text appears in the compose field, regardless of how it got there (keyboard vs AX).

**If true:** We have a complete, injection-free typing indicator solution.

### Scenario B: SetValue does NOT trigger typing indicator
Messages.app may only trigger typing indicators from keyboard events (HID), not from programmatic text changes. In this case, AX SetValue would silently set text without notifying the remote end.

**If true, fallback approaches:**
1. **AX keystroke simulation** — Use `AXUIElementPostKeyboardEvent` or CGEvents to simulate actual keystrokes after focusing the field. This is more likely to trigger the typing indicator path.
2. **AppleScript `keystroke` command** — Use System Events to send keystrokes to the focused field. Less precise but simpler.
3. **Accept the limitation** — Use AX for sending messages (type + press Enter) but not for standalone typing indicators.

### How to Test

1. Open Messages.app on this Mac
2. Select a conversation with a second device you control
3. Run: `swift prototypes/ax-typing/ax-probe.swift --set-text "testing"`
4. Check the second device — is a typing indicator (three dots) visible?
5. If no: try keystroke simulation (Phase 2 of this R&D)

## Permissions Required

| Permission | How to Grant | Required By |
|-----------|-------------|-------------|
| Accessibility | System Settings > Privacy & Security > Accessibility > add Terminal.app (or Node.js binary) | AXUIElement queries and mutations |
| Full Disk Access | System Settings > Privacy & Security > Full Disk Access | NOT required for AX (only for chat.db reads) |
| Automation | System Settings > Privacy & Security > Automation | NOT required (AX is separate from AppleScript automation) |

**Important:** The Accessibility permission must be granted to the specific binary that makes the AX calls. If BlueBubbles runs as an Electron app, the Electron binary needs the permission. If running via Node.js, the Node binary needs it. If using a helper Swift binary, that binary needs it.

**LaunchAgent consideration:** When running as a LaunchAgent, the process inherits the user's accessibility permissions. This should work without additional configuration as long as the binary is in the Accessibility allow-list.

## Integration Architecture

### Recommended: Swift CLI helper

```
BlueBubbles Server
    └── typing indicator request
        └── execFile("ax-typing-cli", ["--start-typing", chatGuid])
            └── Swift binary:
                1. AXUIElementCreateApplication(Messages PID)
                2. Find compose field (by identifier or placeholder)
                3. AXFocus + AXSetValue
                4. Return "OK" / "FAIL"
```

**Why a separate binary?** Node.js native addons for Accessibility are fragile and require native compilation. A precompiled Swift binary is simpler, smaller (~100KB), and can be bundled alongside the server. The `execFile` overhead (~15ms) is negligible compared to the human-perceptible typing indicator.

### Alternative: Node native addon

Could use `node-addon-api` to wrap AXUIElement calls directly. Better performance (no process spawn) but higher maintenance burden and platform compilation complexity.

**Not recommended** for initial implementation — premature optimization.

## Limitations

1. **Conversation must be selected.** AX can only interact with the currently-visible compose field. If the user has a different conversation open (or no conversation), the typing indicator would go to the wrong chat or fail. **Mitigation:** Use AppleScript to select the correct conversation first, then AX to set text.

2. **Single compose field.** Messages.app has one compose field at a time. Concurrent typing indicators for multiple conversations are not possible via this approach.

3. **Accessibility permission is manual.** Users must grant Accessibility permission in System Settings. Unlike Full Disk Access (which can be guided), this requires navigating to a specific pane and toggling a switch.

4. **Apple could change the AX tree.** The element identifier `messageBodyField` is an internal implementation detail. A macOS update could rename or restructure it. The placeholder-based fallback (`iMessage`) is more stable but less specific.

## Files

| File | Purpose |
|------|---------|
| `prototypes/ax-typing/ax-probe.swift` | Interactive AX tree probe and text input tester |
| `prototypes/ax-typing/ax-benchmark.swift` | Performance measurement (find, focus, set, cycle) |
| `prototypes/ax-typing/node-integration.ts` | Concept sketch for Node.js integration |
| `docs/research/2026-04-14-ax-typing-indicators.md` | This document |

## Next Steps

1. **Manual verification** — Test whether SetValue triggers typing indicator (requires second device)
2. If Scenario B: prototype keystroke simulation via AX or CGEvents
3. If Scenario A: build the Swift CLI binary with conversation selection support
4. Integrate into BlueBubbles as a fallback when Private API is unavailable
5. Add conversation selection (AppleScript `set targetChat` before AX text set)
