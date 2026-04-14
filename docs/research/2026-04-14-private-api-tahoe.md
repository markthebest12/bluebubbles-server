# Private API on macOS 26 Tahoe: Research & Path Forward

**Date:** 2026-04-14
**Status:** Active research
**Related issue:** #16

## Executive Summary

Five separate things broke on macOS 26 Tahoe, not just the dylib injection:

| Layer                             | What Broke                                                     | Severity                       | Fixable?                                |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------ | --------------------------------------- |
| DYLIB injection into Messages.app | Launch Constraints enforce trust cache at kernel level         | Fatal                          | No bypass known                         |
| XPC to imagent directly           | Apple-private entitlements required; third-party rejected      | Fatal for typing/read receipts | No bypass known                         |
| AppleScript send                  | Chat GUIDs changed from `iMessage;-;` to `any;-;`; error -1700 | Blocking sends                 | **Yes — one-line mapping fix**          |
| chat.db reads                     | `text` column is NULL; content only in `attributedBody`        | Blocking message detection     | **Yes — column change**                 |
| LaunchAgent FDA                   | Node processes don't inherit Full Disk Access                  | Blocking chat.db access        | **Workaround: launch via Terminal.app** |

## What Can Be Fixed Now

### 1. AppleScript GUID Mapping (upstream #777)

macOS 26 changed chat GUIDs in the Messages database from `iMessage;-;phone` to `any;-;phone`. The AppleScript dictionary only accepts `iMessage`, `SMS`, or `RCS` as service constants — `any` causes error -1700.

**Fix:** Map `any` → `iMessage` in the `buildServiceScript` function before constructing the AppleScript command. One-line change.

### 2. chat.db attributedBody Column

The `text` column in the Messages database is now always NULL on Tahoe. Actual message content is only in `attributedBody` (NSAttributedString binary blob).

**Fix:** Update database queries to read from `attributedBody` and decode the NSAttributedString. The `universalText()` method on the Message entity already has fallback logic — verify it handles this case.

### 3. Full Disk Access Propagation

Node processes launched via LaunchAgent or Login Item don't inherit FDA on Tahoe. chat.db reads fail silently.

**Workaround:** Launch the process through Terminal.app (which has FDA), so child processes inherit it. Use `tmux new-session` for persistence.

**Long-term fix:** A properly signed native .app wrapper that macOS grants FDA to directly.

## What Cannot Be Fixed (Architectural Blockers)

### DYLIB Injection — Launch Constraints

Launch Constraints work via a trust cache at `/System/Library/Security/OSLaunchPolicyData`. Enforcement is at spawn time — AMFI evaluates whether launch conditions match a binary's constraint category before allowing execution.

- Operates independently of SIP — SIP disabled is necessary but NOT sufficient on Tahoe
- Trust cache is cryptographically sealed
- Three constraint types: Self, Parent, Responsible
- Volume constraints prevent copy-and-run exploitation

**Source:** theevilbit blog deep dive on Launch Constraints

### imagent XPC Entitlement Wall

`com.apple.imagent.desktop.auth` now requires Apple-private entitlements. Any third-party process is rejected with "Client does not have any of the allowed entitlements."

- Not a code signing issue — the entitlements themselves are Apple-restricted
- IMCore classes still load, selectors present — wall is purely XPC-level
- `connectToDaemon` and `connectToDaemonWithLaunch:capabilities:` both fail

**Source:** steipete/imsg issue #60

### Protocol Reimplementation (pypush/Beeper) — Dead End

pypush reimplemented iMessage over APNs + IDS in Python. Beeper Mini used this but Apple repeatedly blocked server-side authentication. Beeper Mini shut down 2024, matrix bridge archived April 2025.

Not viable for production — Apple detects and bans unauthorized clients.

## Alternative Approaches (Research Needed)

### Accessibility API for Typing Indicators (Most Promising)

Proposed in steipete/imsg #60: Use `AXUIElement` to programmatically focus the Messages.app text input field. When focused, Messages.app natively sends the typing indicator over iMessage.

- No injection required
- No entitlements needed (just Accessibility permission)
- Unverified on Tahoe but architecturally sound
- Only solves typing indicators, not read receipts

### Messages.app Extension (Uncertain)

If BB shipped a Messages extension loaded by Messages.app itself, it would inherit the app's entitlements. Apple's extension model is limited (iMessage App Extensions / Sticker packs), and likely blocked for IMCore access.

### AMFI Boot Arg (`amfi_get_out_of_my_way`)

Disables AMFI completely at boot. Requires SIP off + NVRAM write. Security nuclear option — only for owned hardware, not end-user installs.

## Community Status

- **BlueBubbles upstream:** Issue #776 (DYLIB failure) and #777 (AppleScript GUID) open, no developer response
- **steipete/imsg:** Removed typing command as non-functional on Tahoe. Proposed Accessibility API approach.
- **Beeper/pypush:** Archived/dead
- **Apple:** WWDC 2024/2025 announced zero public APIs for third-party iMessage integration

## Recommended Action Plan

1. **Immediate:** Fix AppleScript GUID mapping (`any` → `iMessage`) — restores message sending
2. **Immediate:** Fix chat.db reads to use `attributedBody` — restores message detection
3. **Short-term:** Implement Accessibility API typing indicator prototype
4. **Track:** Monitor upstream BlueBubbles for any Tahoe Private API progress
5. **Accept:** Read receipts via Private API are not achievable on Tahoe without Apple changing their entitlement policy

## Sources

- BlueBubblesApp/bluebubbles-server#776 — DYLIB injection failure on Tahoe
- BlueBubblesApp/bluebubbles-server#777 — AppleScript GUID error -1700
- steipete/imsg#60 — imagent entitlement wall, Accessibility API proposal
- theevilbit blog — Launch Constraints deep dive
- openclaw/openclaw#5116 — FDA propagation failure
- openclaw/openclaw#29389 — Private API send regression
- anthropics/claude-code#41783 — chat.db text column NULL
