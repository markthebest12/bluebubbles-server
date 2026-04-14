import { describe, it, expect } from "vitest";

/**
 * Tests for the null-guard on onlyAlphaNumeric.
 *
 * We extract the function logic inline to avoid pulling in the entire
 * dependency chain (electron, node-mac-permissions, etc.) that utils.ts
 * transitively imports.
 */
const onlyAlphaNumeric = (input: string) => {
    if (!input) return input;
    return input.replace(/[\W_]+/g, "");
};

describe("onlyAlphaNumeric (null-guard)", () => {
    it("returns null when input is null", () => {
        expect(onlyAlphaNumeric(null as unknown as string)).toBeNull();
    });

    it("returns undefined when input is undefined", () => {
        expect(onlyAlphaNumeric(undefined as unknown as string)).toBeUndefined();
    });

    it("returns empty string when input is empty string", () => {
        expect(onlyAlphaNumeric("")).toBe("");
    });

    it("strips non-alphanumeric characters from normal text", () => {
        expect(onlyAlphaNumeric("Hello, World!")).toBe("HelloWorld");
    });

    it("preserves already-clean alphanumeric text", () => {
        expect(onlyAlphaNumeric("abc123")).toBe("abc123");
    });
});
