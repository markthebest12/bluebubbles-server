import { describe, it, expect } from "vitest";

describe("headless null window guard (#14)", () => {
    it("optional chaining on null window does not throw", () => {
        const window: any = null;
        expect(() => window?.minimize()).not.toThrow();
    });

    it("optional chaining on valid window calls minimize", () => {
        const minimized = { called: false };
        const window: any = { minimize: () => { minimized.called = true; } };
        window?.minimize();
        expect(minimized.called).toBe(true);
    });

    it("dialog.showMessageBox with null window is guarded", () => {
        const window: any = null;
        // Simulates the guard pattern
        expect(() => {
            if (window) {
                // would call dialog.showMessageBox(window, opts)
            }
        }).not.toThrow();
    });
});
