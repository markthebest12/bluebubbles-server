import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("ChatRouter typing endpoints", () => {
    const routerSource = readFileSync(resolve(__dirname, "../chatRouter.ts"), "utf-8");
    const routesSource = readFileSync(resolve(__dirname, "../../httpRoutes.ts"), "utf-8");

    it("startTyping handler calls ChatInterface.startTyping", () => {
        const match = routerSource.match(/static async startTyping[\s\S]*?ChatInterface\.(startTyping|stopTyping)/);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("startTyping");
    });

    it("stopTyping handler calls ChatInterface.stopTyping (not startTyping)", () => {
        const match = routerSource.match(/static async stopTyping[\s\S]*?ChatInterface\.(startTyping|stopTyping)/);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("stopTyping");
    });

    it("POST typing route maps to startTyping controller", () => {
        expect(routesSource).toContain("controller: ChatRouter.startTyping");
    });

    it("DELETE typing route maps to stopTyping controller", () => {
        expect(routesSource).toContain("controller: ChatRouter.stopTyping");
    });
});
