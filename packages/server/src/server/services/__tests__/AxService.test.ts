import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process.execFile
vi.mock("child_process", () => ({
    execFile: vi.fn()
}));

// Mock @server to avoid Electron dependency chain
vi.mock("@server", () => ({
    Server: () => ({
        log: vi.fn()
    })
}));

// Mock the Loggable base class
vi.mock("@server/lib/logging/Loggable", () => ({
    Loggable: class {
        log = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        };
    }
}));

import { execFile } from "child_process";
import { AxService } from "../AxService";

describe("AxService", () => {
    let service: AxService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new AxService("/path/to/ax-helper");
    });

    describe("constructor", () => {
        it("stores binary path", () => {
            expect(service.binaryPath).toBe("/path/to/ax-helper");
        });
    });

    describe("tapback", () => {
        it("calls ax-helper with correct arguments", async () => {
            const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
            mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
                cb(null, '{"ok":true,"op":"tapback","type":"heart","ms":5}', "");
            });

            const result = await service.tapback("heart", "trace-1");
            expect(mockExecFile).toHaveBeenCalledWith(
                "/path/to/ax-helper",
                ["tapback", "heart", "--trace-id", "trace-1"],
                expect.objectContaining({ timeout: 5000 }),
                expect.any(Function)
            );
            expect(result.ok).toBe(true);
        });

        it("rejects invalid tapback types", async () => {
            await expect(service.tapback("invalid", "t1")).rejects.toThrow("Invalid tapback type");
        });
    });

    describe("markRead", () => {
        it("calls ax-helper mark-read", async () => {
            const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
            mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
                cb(null, '{"ok":true,"op":"mark-read","ms":3}', "");
            });

            const result = await service.markRead("trace-2");
            expect(mockExecFile).toHaveBeenCalledWith(
                "/path/to/ax-helper",
                ["mark-read", "--trace-id", "trace-2"],
                expect.objectContaining({ timeout: 5000 }),
                expect.any(Function)
            );
            expect(result.ok).toBe(true);
        });
    });

    describe("navigate", () => {
        it("calls ax-helper navigate next", async () => {
            const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
            mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
                cb(null, '{"ok":true,"op":"navigate","direction":"next","ms":2}', "");
            });

            const result = await service.navigate("next", "trace-3");
            expect(mockExecFile).toHaveBeenCalledWith(
                "/path/to/ax-helper",
                ["navigate", "next", "--trace-id", "trace-3"],
                expect.objectContaining({ timeout: 5000 }),
                expect.any(Function)
            );
            expect(result.ok).toBe(true);
        });

        it("rejects invalid direction", async () => {
            await expect(service.navigate("sideways" as any, "t1")).rejects.toThrow("Invalid direction");
        });
    });

    describe("check", () => {
        it("calls ax-helper check", async () => {
            const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
            mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
                cb(null, '{"ok":true,"op":"check","menuItems":{"tapback":"enabled"}}', "");
            });

            const result = await service.check("trace-4");
            expect(result.ok).toBe(true);
            expect(result.menuItems).toBeDefined();
        });
    });

    describe("serialization", () => {
        it("executes operations sequentially", async () => {
            const callOrder: number[] = [];
            const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
            mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: any, cb: Function) => {
                const op = args[0];
                if (op === "tapback") {
                    callOrder.push(1);
                    setTimeout(() => cb(null, '{"ok":true,"op":"tapback","ms":1}', ""), 50);
                } else {
                    callOrder.push(2);
                    setTimeout(() => cb(null, '{"ok":true,"op":"mark-read","ms":1}', ""), 10);
                }
            });

            const [r1, r2] = await Promise.all([service.tapback("heart", "t1"), service.markRead("t2")]);

            expect(callOrder).toEqual([1, 2]);
            expect(r1.ok).toBe(true);
            expect(r2.ok).toBe(true);
        });
    });

    describe("error handling", () => {
        it("rejects on ax-helper failure (ok:false in output)", async () => {
            const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
            mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
                const error: any = new Error("exit code 1");
                error.code = 1;
                cb(error, '{"ok":false,"op":"tapback","error":"menu_item_disabled"}', "Menu item disabled");
            });

            await expect(service.tapback("heart", "t1")).rejects.toThrow("menu_item_disabled");
        });

        it("rejects on timeout", async () => {
            const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
            mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
                const error: any = new Error("TIMEOUT");
                error.killed = true;
                cb(error, "", "");
            });

            await expect(service.tapback("heart", "t1")).rejects.toThrow("timeout");
        });

        it("sanitizes traceId to prevent injection", async () => {
            const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
            mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
                cb(null, '{"ok":true,"op":"mark-read","ms":1}', "");
            });

            // Invalid traceId should be silently dropped (not passed to CLI)
            await service.markRead("../../etc/passwd");
            expect(mockExecFile).toHaveBeenCalledWith(
                "/path/to/ax-helper",
                ["mark-read"],
                expect.any(Object),
                expect.any(Function)
            );
        });

        it("does not mutate args array on repeated calls", async () => {
            const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
            mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: Function) => {
                cb(null, '{"ok":true,"op":"mark-read","ms":1}', "");
            });

            await service.markRead("t1");
            await service.markRead("t2");

            const calls = mockExecFile.mock.calls;
            expect(calls[0][1]).toEqual(["mark-read", "--trace-id", "t1"]);
            expect(calls[1][1]).toEqual(["mark-read", "--trace-id", "t2"]);
        });
    });
});
