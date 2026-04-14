import { describe, it, expect, vi } from "vitest";
import fs from "fs";

vi.mock("fs", async () => {
    const actual = await vi.importActual<typeof import("fs")>("fs");
    return {
        ...actual,
        default: {
            ...actual,
            existsSync: vi.fn().mockReturnValue(true),
            statSync: vi.fn().mockReturnValue({ size: 100, mtimeMs: Date.now() }),
            watch: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() })
        },
        existsSync: vi.fn().mockReturnValue(true),
        statSync: vi.fn().mockReturnValue({ size: 100, mtimeMs: Date.now() }),
        watch: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() })
    };
});

describe("MultiFileWatcher", () => {
    it("creates watchers with persistent: true to prevent idle death", async () => {
        vi.clearAllMocks();
        const { MultiFileWatcher } = await import("../MultiFileWatcher");
        const watcher = new MultiFileWatcher(["/tmp/test.db"]);
        watcher.start();
        expect(fs.watch).toHaveBeenCalledWith("/tmp/test.db", expect.objectContaining({ persistent: true }));
    });
});
