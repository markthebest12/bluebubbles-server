import { describe, it, expect } from "vitest";

/**
 * Tests for message.text null-guard safety.
 *
 * The Message entity's text column is nullable in the DB but was typed as
 * `string` (now `string | null`). These tests verify the critical code
 * paths that access .text won't crash on null/undefined values.
 *
 * We replicate the core logic inline to avoid the Electron/native module
 * dependency chain from the actual Message entity imports.
 */

// Replicate isEmpty from utils (null-safe)
const isEmpty = (value: any): boolean => {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
};

// Replicate sanitizeStr from utils (already null-safe)
const sanitizeStr = (val: string | null): string | null => {
    if (!val) return val;
    return val;
};

// Replicate universalText logic from Message entity
function universalText(text: string | null, attributedText: string | null, sanitize = false): string | null {
    let result = text;
    if (isEmpty(result) && !isEmpty(attributedText)) {
        result = attributedText;
    }
    return sanitize ? sanitizeStr(result) : result;
}

// Replicate contentString logic from Message entity
function contentString(
    text: string | null,
    attributedText: string | null,
    attachments: any[],
    subject: string | null,
    dateCreated: Date,
    maxText = 15
): string {
    let displayText = universalText(text, attributedText, true) ?? "";
    const textLen = displayText.length;
    const attachmentsLen = attachments.length;
    let displaySubject = subject ?? "";
    const subjectLen = displaySubject.length;

    const parts = [];

    if (textLen > 0) {
        if (textLen > maxText) {
            displayText = `${displayText.substring(0, maxText)}...`;
        }
        parts.push(`"${displayText}"`);
    } else {
        parts.push(`<No Text>`);
    }

    if (subjectLen > 0) {
        if (subjectLen > maxText) {
            displaySubject = `${displaySubject.substring(0, maxText)}...`;
        }
        parts.push(`Subject: "${displaySubject}"`);
    }

    if (attachmentsLen > 0) parts.push(`Attachments: ${attachmentsLen}`);
    parts.push(`Date: ${dateCreated.toLocaleString()}`);

    return parts.join("; ");
}

// Replicate hasQueuedMessage filter logic from server/databases/server/index.ts
function filterByTextStartsWith(
    items: Array<{ tempGuid: string; text: string | null }>,
    tempGuid: string
): Array<{ tempGuid: string; text: string | null }> {
    return items.filter(item => item.tempGuid === tempGuid || item.text?.startsWith(tempGuid));
}

describe("Message.universalText (null-guard)", () => {
    it("does not crash when text is null", () => {
        expect(() => universalText(null, null)).not.toThrow();
        expect(universalText(null, null)).toBeNull();
    });

    it("does not crash when text is undefined", () => {
        expect(() => universalText(undefined as unknown as string, null)).not.toThrow();
    });

    it("returns empty string text correctly", () => {
        expect(universalText("", null)).toBe("");
    });

    it("returns normal text correctly", () => {
        expect(universalText("Hello world", null)).toBe("Hello world");
    });

    it("falls back to attributedText when text is null", () => {
        expect(universalText(null, "From attributed body")).toBe("From attributed body");
    });
});

describe("Message.contentString (null-guard)", () => {
    const date = new Date("2025-01-01T00:00:00Z");

    it("does not crash when text is null", () => {
        expect(() => contentString(null, null, [], null, date)).not.toThrow();
        expect(contentString(null, null, [], null, date)).toContain("<No Text>");
    });

    it("does not crash when text is undefined", () => {
        expect(() => contentString(undefined as unknown as string, null, [], null, date)).not.toThrow();
    });

    it("handles empty string text", () => {
        const result = contentString("", null, [], null, date);
        expect(result).toContain("<No Text>");
    });

    it("includes normal text in output", () => {
        const result = contentString("Hi there", null, [], null, date);
        expect(result).toContain('"Hi there"');
    });

    it("truncates long text", () => {
        const result = contentString("This is a very long message that exceeds the limit", null, [], null, date, 15);
        expect(result).toContain("...");
    });
});

describe("hasQueuedMessage filter (null-guard)", () => {
    it("does not crash when item.text is null", () => {
        const items = [
            { tempGuid: "abc", text: null },
            { tempGuid: "def", text: "temp-123-hello" }
        ];
        expect(() => filterByTextStartsWith(items, "temp-123")).not.toThrow();
        const result = filterByTextStartsWith(items, "temp-123");
        expect(result).toHaveLength(1);
        expect(result[0].tempGuid).toBe("def");
    });

    it("does not crash when item.text is undefined", () => {
        const items = [{ tempGuid: "abc", text: undefined as unknown as string }];
        expect(() => filterByTextStartsWith(items, "abc")).not.toThrow();
    });

    it("matches by tempGuid even when text is null", () => {
        const items = [{ tempGuid: "match-me", text: null }];
        const result = filterByTextStartsWith(items, "match-me");
        expect(result).toHaveLength(1);
    });

    it("matches by text startsWith", () => {
        const items = [{ tempGuid: "other", text: "temp-456-world" }];
        const result = filterByTextStartsWith(items, "temp-456");
        expect(result).toHaveLength(1);
    });

    it("returns empty when no matches", () => {
        const items = [{ tempGuid: "other", text: "no-match" }];
        const result = filterByTextStartsWith(items, "temp-789");
        expect(result).toHaveLength(0);
    });
});

/**
 * Tahoe compatibility tests.
 *
 * macOS 26 Tahoe sets message.text to NULL in chat.db for all messages.
 * Message content is only available via attributedBody. These tests verify
 * that all critical code paths handle this correctly.
 */
describe("Tahoe compatibility (text=NULL, attributedBody populated)", () => {
    describe("universalText", () => {
        it("returns attributedBody text when text is null (Tahoe scenario)", () => {
            expect(universalText(null, "Hello from Tahoe")).toBe("Hello from Tahoe");
        });

        it("returns attributedBody text when text is null and sanitize=true", () => {
            expect(universalText(null, "Hello from Tahoe", true)).toBe("Hello from Tahoe");
        });

        it("prefers text column when both are populated (pre-Tahoe)", () => {
            expect(universalText("From text col", "From attributed body")).toBe("From text col");
        });

        it("returns null when both text and attributedBody are null (Tahoe, no content)", () => {
            expect(universalText(null, null)).toBeNull();
        });

        it("returns attributedBody for empty string text with attributedBody", () => {
            expect(universalText("", "Fallback content")).toBe("Fallback content");
        });

        it("returns attributedBody for whitespace-only text", () => {
            expect(universalText("   ", "Fallback content")).toBe("Fallback content");
        });
    });

    describe("contentString", () => {
        const date = new Date("2026-04-14T00:00:00Z");

        it("displays attributedBody text when text is null", () => {
            const result = contentString(null, "Tahoe message", [], null, date);
            expect(result).toContain('"Tahoe message"');
            expect(result).not.toContain("<No Text>");
        });

        it("truncates long attributedBody text", () => {
            const result = contentString(null, "This is a long Tahoe message body", [], null, date, 15);
            expect(result).toContain("...");
        });

        it("shows <No Text> only when both text and attributedBody are null", () => {
            const result = contentString(null, null, [], null, date);
            expect(result).toContain("<No Text>");
        });

        it("includes attachment count alongside attributedBody text", () => {
            const result = contentString(null, "Photo", [{ name: "image.jpg" }], null, date);
            expect(result).toContain('"Photo"');
            expect(result).toContain("Attachments: 1");
        });
    });

    describe("MessagePoller group change filter (isEmpty(e.text) && itemType guard)", () => {
        // Replicate the MessagePoller line 56 filter logic
        function filterGroupChanges(entries: Array<{ text: string | null; itemType: number }>) {
            return entries.filter(e => isEmpty(e.text) && [1, 2, 3].includes(e.itemType));
        }

        it("does NOT match regular messages (itemType=0) even when text is null on Tahoe", () => {
            const entries = [
                { text: null, itemType: 0 },  // Regular message on Tahoe — text is null
                { text: null, itemType: 0 },  // Another regular message
            ];
            expect(filterGroupChanges(entries)).toHaveLength(0);
        });

        it("matches group changes (itemType=1,2,3) when text is null", () => {
            const entries = [
                { text: null, itemType: 1 },  // participant added
                { text: null, itemType: 2 },  // name change
                { text: null, itemType: 3 },  // participant left / icon changed
            ];
            expect(filterGroupChanges(entries)).toHaveLength(3);
        });

        it("correctly separates regular messages from group changes on Tahoe", () => {
            const entries = [
                { text: null, itemType: 0 },  // Regular message (Tahoe null text)
                { text: null, itemType: 1 },  // Group change
                { text: null, itemType: 0 },  // Regular message (Tahoe null text)
                { text: null, itemType: 2 },  // Name change
            ];
            const groupChanges = filterGroupChanges(entries);
            expect(groupChanges).toHaveLength(2);
            expect(groupChanges.every(e => e.itemType !== 0)).toBe(true);
        });
    });

    describe("hasQueuedMessage filter with Tahoe null text", () => {
        it("matches by tempGuid when text is null (Tahoe queue item)", () => {
            const items = [{ tempGuid: "temp-abc", text: null }];
            const result = filterByTextStartsWith(items, "temp-abc");
            expect(result).toHaveLength(1);
        });

        it("does not crash on text?.startsWith when text is null", () => {
            const items = [{ tempGuid: "other", text: null }];
            expect(() => filterByTextStartsWith(items, "temp-xyz")).not.toThrow();
            expect(filterByTextStartsWith(items, "temp-xyz")).toHaveLength(0);
        });
    });
});
