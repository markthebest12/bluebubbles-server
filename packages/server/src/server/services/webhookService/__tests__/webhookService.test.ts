import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// Mock axios
vi.mock("axios", () => ({
    default: { post: vi.fn().mockResolvedValue({ status: 200 }) },
    __esModule: true
}));

// Mock Server
const mockGetConfig = vi.fn();
const mockGetWebhooks = vi.fn();

vi.mock("@server", () => ({
    Server: () => ({
        repo: {
            getConfig: mockGetConfig,
            getWebhooks: mockGetWebhooks
        }
    })
}));

// Mock Loggable so we don't need EventEmitter or Logger
vi.mock("@server/lib/logging/Loggable", () => ({
    Loggable: class {
        tag: string;
        log = { debug: vi.fn(), on: vi.fn() };
        onLog() {}
    }
}));

import { WebhookService } from "../index";

describe("WebhookService", () => {
    let service: WebhookService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new WebhookService();
    });

    describe("sendPost Authorization header", () => {
        it("should include Authorization header when password is configured", async () => {
            mockGetConfig.mockReturnValue("my-secret-password");
            mockGetWebhooks.mockResolvedValue([
                { url: "https://example.com/webhook", events: JSON.stringify(["*"]) }
            ]);

            await service.dispatch({ type: "new-message", data: {} });

            // Allow the fire-and-forget promise to resolve
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(axios.post).toHaveBeenCalledWith(
                "https://example.com/webhook",
                { type: "new-message", data: {} },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer my-secret-password"
                    }
                }
            );
        });

        it("should not include Authorization header when password is empty", async () => {
            mockGetConfig.mockReturnValue("");
            mockGetWebhooks.mockResolvedValue([
                { url: "https://example.com/webhook", events: JSON.stringify(["*"]) }
            ]);

            await service.dispatch({ type: "new-message", data: {} });

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(axios.post).toHaveBeenCalledWith(
                "https://example.com/webhook",
                { type: "new-message", data: {} },
                {
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        });

        it("should not include Authorization header when password is null", async () => {
            mockGetConfig.mockReturnValue(null);
            mockGetWebhooks.mockResolvedValue([
                { url: "https://example.com/webhook", events: JSON.stringify(["*"]) }
            ]);

            await service.dispatch({ type: "new-message", data: {} });

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(axios.post).toHaveBeenCalledWith(
                "https://example.com/webhook",
                { type: "new-message", data: {} },
                {
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        });
    });
});
