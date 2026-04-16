import { describe, it, expect, vi } from "vitest";

/**
 * Tests for AppleScript GUID service-type mapping (Issue #18).
 *
 * macOS 26 Tahoe changed chat GUIDs from `iMessage;-;addr` to `any;-;addr`,
 * but AppleScript rejects `any` as a service type (error -1700).
 * mapServiceType() remaps `any` back to `iMessage` before building scripts.
 *
 * We mock platform-specific modules to avoid Electron/macOS dependencies,
 * following the pattern established in Message.test.ts.
 */

// --- Mock platform-specific modules before any imports ---

vi.mock("macos-version", () => ({
    default: () => "15.0",
    isGreaterThanOrEqualTo: (v: string) => {
        const target = parseFloat(v);
        return 15.0 >= target;
    }
}));

vi.mock("compare-versions", () => ({
    default: (a: string, b: string) => {
        const [aMaj, aMin = 0] = a.split(".").map(Number);
        const [bMaj, bMin = 0] = b.split(".").map(Number);
        if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
        if (aMin !== bMin) return aMin > bMin ? 1 : -1;
        return 0;
    }
}));

vi.mock("electron-log", () => ({
    transports: { file: { getFile: () => ({ path: "/tmp/fake.log" }) } }
}));

vi.mock("../../../fileSystem", () => ({
    FileSystem: { baseDir: "/tmp", contactsDir: "/tmp" }
}));

vi.mock("../../../env", () => ({
    isMinBigSur: true,
    isMinVentura: true,
    isMinMonterey: true,
    isMinSequoia: true,
    isMinSonoma: true,
    isMinCatalina: true,
    isMinMojave: true,
    isMinHighSierra: true,
    isMinSierra: true
}));

// Mock @server/helpers/utils — matches real impl signatures
vi.mock("../../../helpers/utils", () => ({
    escapeOsaExp: (input: string) => {
        return input.replace(/\\/g, "\\\\\\\\").replace(/"/g, '\\\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
    },
    getiMessageAddressFormat: (address: string) => {
        // Simplified: returns address as-is. Real impl does phone formatting.
        return address;
    },
    isEmpty: (value: any, trim = true): boolean => {
        if (!value && value !== 0 && value !== false) return true;
        if (typeof value === "string") return (trim ? value.trim() : value).length === 0;
        if (Array.isArray(value)) {
            if (trim) return value.filter(i => i != null).length === 0;
            return value.length === 0;
        }
        return false;
    },
    isNotEmpty: (value: any, trim = true): boolean => {
        if (!value && value !== 0 && value !== false) return false;
        if (typeof value === "string" && (trim ? value.trim() : value).length > 0) return true;
        if (typeof value === "object" && Array.isArray(value)) {
            if (trim) return value.filter(i => i != null).length > 0;
            return value.length > 0;
        }
        return false;
    }
}));

// --- Import after mocks are set up ---

import { mapServiceType, sendMessage, sendMessageFallback, startChat } from "../scripts";

// ============================================================
// Unit tests: mapServiceType
// ============================================================

describe("mapServiceType", () => {
    it("maps 'any' to 'iMessage'", () => {
        expect(mapServiceType("any")).toBe("iMessage");
    });

    it("maps 'Any' (mixed case) to 'iMessage'", () => {
        expect(mapServiceType("Any")).toBe("iMessage");
    });

    it("maps 'ANY' (uppercase) to 'iMessage'", () => {
        expect(mapServiceType("ANY")).toBe("iMessage");
    });

    it("passes through 'iMessage' unchanged", () => {
        expect(mapServiceType("iMessage")).toBe("iMessage");
    });

    it("passes through 'SMS' unchanged", () => {
        expect(mapServiceType("SMS")).toBe("SMS");
    });

    it("passes through 'RCS' unchanged", () => {
        expect(mapServiceType("RCS")).toBe("RCS");
    });

    it("returns empty string for empty string input", () => {
        expect(mapServiceType("")).toBe("");
    });

    it("handles null/undefined gracefully", () => {
        expect(mapServiceType(null as unknown as string)).toBeNull();
        expect(mapServiceType(undefined as unknown as string)).toBeUndefined();
    });

    it("does not trim — ' any ' passes through unchanged", () => {
        expect(mapServiceType(" any ")).toBe(" any ");
    });
});

// ============================================================
// Integration tests: sendMessage with Tahoe GUIDs
// ============================================================

describe("sendMessage with Tahoe GUIDs", () => {
    // sendMessage preserves the service prefix in chat IDs because Messages.app
    // on Tahoe only recognizes "any;-;" GUIDs, not "iMessage;-;".
    // mapServiceType is only used for the `service type` AppleScript parameter.
    it("preserves 'any' service prefix in chat GUID (Tahoe compatibility)", () => {
        const script = sendMessage("any;-;+11234567890", "Hello", "");
        expect(script).toContain('chat id "any;-;+11234567890"');
    });

    it("preserves 'iMessage;-;+11234567890'", () => {
        const script = sendMessage("iMessage;-;+11234567890", "Hello", "");
        expect(script).toContain('chat id "iMessage;-;+11234567890"');
    });

    it("preserves 'SMS;-;+11234567890'", () => {
        const script = sendMessage("SMS;-;+11234567890", "Hello", "");
        expect(script).toContain('chat id "SMS;-;+11234567890"');
        expect(script).not.toContain("iMessage;-;");
    });

    it("preserves 'any' in group chat GUIDs (any;+;chatXXX)", () => {
        const script = sendMessage("any;+;chat123456789", "Hello", "");
        expect(script).toContain('chat id "any;+;chat123456789"');
    });

    it("preserves group chat GUID with iMessage service", () => {
        const script = sendMessage("iMessage;+;chat123456789", "Hello", "");
        expect(script).toContain('chat id "iMessage;+;chat123456789"');
    });
});

// ============================================================
// Integration tests: sendMessageFallback with Tahoe GUIDs
// ============================================================

describe("sendMessageFallback with Tahoe GUIDs", () => {
    it("maps 'any;-;+11234567890' to 'service type = iMessage' with correct address", () => {
        const script = sendMessageFallback("any;-;+11234567890", "Hello", "");
        expect(script).toContain("service type = iMessage");
        expect(script).toContain('"+11234567890"');
        expect(script).not.toContain("service type = any");
    });

    it("preserves 'SMS;-;+11234567890' with correct address", () => {
        const script = sendMessageFallback("SMS;-;+11234567890", "Hello", "");
        expect(script).toContain("service type = SMS");
        expect(script).toContain('"+11234567890"');
        expect(script).not.toContain("service type = iMessage");
    });

    it("preserves 'iMessage;-;+11234567890'", () => {
        const script = sendMessageFallback("iMessage;-;+11234567890", "Hello", "");
        expect(script).toContain("service type = iMessage");
        expect(script).toContain('"+11234567890"');
    });
});

// ============================================================
// Integration tests: startChat with Tahoe service type
// ============================================================

describe("startChat with Tahoe service type", () => {
    it("maps service 'any' to 'service type = iMessage'", () => {
        const script = startChat(["+11234567890"], "any", "Hello");
        expect(script).toContain("service type = iMessage");
        expect(script).not.toContain("service type = any");
    });

    it("preserves 'iMessage' service type", () => {
        const script = startChat(["+11234567890"], "iMessage", "Hello");
        expect(script).toContain("service type = iMessage");
    });

    it("preserves 'SMS' service type", () => {
        const script = startChat(["+11234567890"], "SMS", "Hello");
        expect(script).toContain("service type = SMS");
        expect(script).not.toContain("service type = iMessage");
    });

    it("preserves 'RCS' service type", () => {
        const script = startChat(["+11234567890"], "RCS", "Hello");
        expect(script).toContain("service type = RCS");
        expect(script).not.toContain("service type = iMessage");
    });
});
