/**
 * Vitest global setup — mocks native/Electron modules that are unavailable on CI runners.
 *
 * The `electron` package, `node-mac-permissions`, and other native modules fail to load
 * on non-macOS CI runners. These global mocks prevent transitive imports from reaching them.
 *
 * Additionally, the codebase has a circular dependency chain:
 *   Loggable -> Logger -> @server -> MessageRepository -> Loggable
 * Mocking the Logger module breaks this cycle.
 */
import { vi } from "vitest";

// --- Electron (throws "Electron failed to install correctly" on CI) ---
vi.mock("electron", () => ({
    app: {
        getPath: vi.fn().mockReturnValue("/tmp"),
        setPath: vi.fn(),
        getVersion: vi.fn().mockReturnValue("0.0.0"),
        getName: vi.fn().mockReturnValue("test"),
        isPackaged: false,
        on: vi.fn(),
        quit: vi.fn()
    },
    BrowserWindow: vi.fn(),
    nativeTheme: { shouldUseDarkColors: false },
    systemPreferences: { getUserDefault: vi.fn() },
    dialog: { showMessageBox: vi.fn() },
    nativeImage: { createFromPath: vi.fn() },
    ipcMain: { on: vi.fn(), handle: vi.fn() },
    shell: { openExternal: vi.fn() }
}));

// --- electron-log (depends on electron at runtime) ---
vi.mock("electron-log", () => {
    const logFn = vi.fn();
    const log: any = Object.assign(logFn, {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn(),
        transports: {
            file: {
                getFile: () => ({ path: "/tmp/fake.log" }),
                level: "info"
            },
            console: { level: "info" }
        }
    });
    return { default: log, ...log };
});

// --- node-mac-permissions (native binding, not available on Linux CI) ---
vi.mock("node-mac-permissions", () => ({
    getAuthStatus: vi.fn().mockReturnValue("authorized"),
    askForFullDiskAccess: vi.fn(),
    askForAccessibilityAccess: vi.fn()
}));

// --- macOS-specific modules ---
vi.mock("macos-version", () => ({
    default: () => "15.0",
    isGreaterThanOrEqualTo: (v: string) => {
        const target = parseFloat(v);
        return 15.0 >= target;
    }
}));

// --- read-chunk (native module, may not build on CI) ---
vi.mock("read-chunk", () => ({
    sync: vi.fn().mockReturnValue(Buffer.alloc(0))
}));
