/**
 * Node.js integration sketch for Accessibility API typing indicators.
 *
 * This is a CONCEPT — not production code. It shows how the AX approach
 * would integrate into BlueBubbles server as an alternative to Private API
 * typing indicators on macOS 26 Tahoe.
 *
 * Implementation options:
 *   1. Shell out to the Swift CLI tool (simplest, ~15ms overhead)
 *   2. Native Node addon using node-addon-api + Accessibility.framework
 *   3. Use @electron/remote to call native macOS APIs from the Electron main process
 *
 * Option 1 is recommended for initial integration — it's the simplest and
 * the performance is more than adequate (total cycle < 20ms).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

// Path to the compiled Swift binary (would be bundled with the server)
const AX_BINARY = path.join(__dirname, "ax-typing-cli");

/**
 * Trigger a typing indicator by setting text in Messages.app's compose field.
 *
 * The approach:
 *   1. Find Messages.app's compose field via AXUIElement query
 *   2. Focus the field (required for some AX operations)
 *   3. Set a placeholder value (triggers typing indicator on remote end — NEEDS VERIFICATION)
 *   4. Optionally clear the field after a delay
 *
 * @param chatGuid - The chat to type in (used to select the right conversation)
 * @returns true if the typing indicator was triggered successfully
 */
export async function startTypingViaAX(chatGuid: string): Promise<boolean> {
    try {
        // The Swift CLI handles finding the compose field and setting focus+text
        const { stdout } = await execFileAsync(AX_BINARY, ["--start-typing", chatGuid], {
            timeout: 5000
        });
        return stdout.includes("OK");
    } catch (err) {
        // AX failures are non-fatal — typing indicators are nice-to-have
        console.warn(`AX typing indicator failed: ${err}`);
        return false;
    }
}

export async function stopTypingViaAX(): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync(AX_BINARY, ["--stop-typing"], {
            timeout: 5000
        });
        return stdout.includes("OK");
    } catch (err) {
        console.warn(`AX stop typing failed: ${err}`);
        return false;
    }
}

/**
 * Check if AX typing indicators are available on this system.
 *
 * Requirements:
 *   - macOS (darwin)
 *   - Accessibility permission granted
 *   - Messages.app running
 *   - A conversation must be selected in Messages.app
 */
export async function isAXTypingAvailable(): Promise<{
    available: boolean;
    reason?: string;
}> {
    if (process.platform !== "darwin") {
        return { available: false, reason: "Not macOS" };
    }

    try {
        const { stdout } = await execFileAsync(AX_BINARY, ["--check"], {
            timeout: 5000
        });

        if (stdout.includes("NO_PERMISSION")) {
            return { available: false, reason: "Accessibility permission not granted" };
        }
        if (stdout.includes("NO_MESSAGES")) {
            return { available: false, reason: "Messages.app not running" };
        }
        if (stdout.includes("NO_COMPOSE")) {
            return { available: false, reason: "No conversation selected in Messages.app" };
        }
        if (stdout.includes("OK")) {
            return { available: true };
        }
        return { available: false, reason: "Unknown state" };
    } catch {
        return { available: false, reason: "AX binary not found or not executable" };
    }
}
