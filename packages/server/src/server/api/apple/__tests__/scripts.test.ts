import { describe, it, expect, vi, beforeAll } from "vitest";

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
        // Simulate macOS 15+ (Sequoia/Tahoe era)
        const target = parseFloat(v);
        return 15.0 >= target;
    }
}));

vi.mock("compare-versions", () => ({
    default: (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })
}));

vi.mock("electron-log", () => ({
    transports: { file: { getFile: () => ({ path: "/tmp/fake.log" }) } }
}));

vi.mock("@server/fileSystem", () => ({
    FileSystem: { baseDir: "/tmp", contactsDir: "/tmp" }
}));

vi.mock("@server/env", () => ({
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

// Mock @server/helpers/utils with the functions scripts.ts actually uses
vi.mock("@server/helpers/utils", () => ({
    escapeOsaExp: (input: string) => {
        return input
            .replace(/\\/g, "\\\\\\\\")
            .replace(/"/g, '\\\\"')
            .replace(/\$/g, "\\$")
            .replace(/`/g, "\\`");
    },
    getiMessageAddressFormat: (address: string) => {
        // Simplified: just return the address as-is for test purposes
        // Real impl does phone number formatting, but we only care about service mapping
        return address;
    },
    isEmpty: (value: any): boolean => {
        if (value === null || value === undefined) return true;
        if (typeof value === "string") return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        return false;
    },
    isNotEmpty: (value: any): boolean => {
        if (!value) return false;
        if (typeof value === "string" && value.trim().length > 0) return true;
        if (Array.isArray(value) && value.length > 0) return true;
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
});

// ============================================================
// Integration tests: sendMessage with Tahoe GUIDs
// ============================================================

describe("sendMessage with Tahoe GUIDs", () => {
    it("maps 'any;-;+11234567890' to produce script with 'iMessage;-;' not 'any;-;'", () => {
        const script = sendMessage("any;-;+11234567890", "Hello", "");
        expect(script).not.toBeNull();
        expect(script).toContain("iMessage;-;");
        expect(script).not.toContain("any;-;");
    });

    it("preserves 'iMessage;-;+11234567890'", () => {
        const script = sendMessage("iMessage;-;+11234567890", "Hello", "");
        expect(script).not.toBeNull();
        expect(script).toContain("iMessage;-;");
    });

    it("preserves 'SMS;-;+11234567890'", () => {
        const script = sendMessage("SMS;-;+11234567890", "Hello", "");
        expect(script).not.toBeNull();
        expect(script).toContain("SMS;-;");
        expect(script).not.toContain("iMessage;-;");
    });
});

// ============================================================
// Integration tests: sendMessageFallback with Tahoe GUIDs
// ============================================================

describe("sendMessageFallback with Tahoe GUIDs", () => {
    it("maps 'any;-;+11234567890' to produce 'service type = iMessage' not 'service type = any'", () => {
        const script = sendMessageFallback("any;-;+11234567890", "Hello", "");
        expect(script).not.toBeNull();
        expect(script).toContain("service type = iMessage");
        expect(script).not.toContain("service type = any");
    });

    it("preserves 'SMS;-;+11234567890'", () => {
        const script = sendMessageFallback("SMS;-;+11234567890", "Hello", "");
        expect(script).not.toBeNull();
        expect(script).toContain("service type = SMS");
        expect(script).not.toContain("service type = iMessage");
    });
});

// ============================================================
// Integration tests: startChat with Tahoe service type
// ============================================================

describe("startChat with Tahoe service type", () => {
    it("maps service 'any' to produce 'service type = iMessage'", () => {
        const script = startChat(["+11234567890"], "any", "Hello");
        expect(script).toContain("service type = iMessage");
        expect(script).not.toContain("service type = any");
    });
});
