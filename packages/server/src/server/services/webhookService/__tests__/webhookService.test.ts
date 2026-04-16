import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");

const mockGetWebhooks = vi.fn().mockResolvedValue([]);
const mockGetConfig = vi.fn().mockReturnValue("test-password");

// Use relative paths for vi.mock — alias-based paths (@server/...) don't
// resolve correctly for mock matching in Vitest 4 with vite-tsconfig-paths.
vi.mock("../../../index", () => ({
    Server: () => ({
        repo: {
            getWebhooks: mockGetWebhooks,
            getConfig: mockGetConfig
        }
    })
}));

vi.mock("../../../lib/logging/Loggable", () => ({
    Loggable: class {
        log = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        };
    },
    getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        on: vi.fn()
    })
}));

import { WebhookService } from "../index";

describe("WebhookService", () => {
    let service: WebhookService;
    const mockedAxios = vi.mocked(axios);

    beforeEach(() => {
        vi.clearAllMocks();
        service = new WebhookService();
        // Use 0ms delay in tests so retries resolve instantly
        service.retryBaseDelayMs = 0;
        // Restore default mock behavior after clearAllMocks
        mockGetWebhooks.mockResolvedValue([]);
        mockGetConfig.mockReturnValue("test-password");
    });

    describe("sendPost retry behavior", () => {
        it("succeeds on first attempt without retry", async () => {
            mockedAxios.post.mockResolvedValueOnce({ status: 200 });

            await (service as any).sendPost("https://example.com/hook", { type: "test", data: {} });

            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        });

        it("retries on failure and succeeds on second attempt", async () => {
            mockedAxios.post.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockResolvedValueOnce({ status: 200 });

            await (service as any).sendPost("https://example.com/hook", { type: "test", data: {} });

            expect(mockedAxios.post).toHaveBeenCalledTimes(2);
            expect(service.log.debug).toHaveBeenCalledWith(expect.stringContaining("attempt 1/3"));
        });

        it("retries on failure and succeeds on third attempt", async () => {
            mockedAxios.post
                .mockRejectedValueOnce(new Error("ECONNREFUSED"))
                .mockRejectedValueOnce(new Error("ECONNREFUSED"))
                .mockResolvedValueOnce({ status: 200 });

            await (service as any).sendPost("https://example.com/hook", { type: "test", data: {} });

            expect(mockedAxios.post).toHaveBeenCalledTimes(3);
        });

        it("throws after max retries exhausted", async () => {
            mockedAxios.post
                .mockRejectedValueOnce(new Error("ECONNREFUSED"))
                .mockRejectedValueOnce(new Error("ECONNREFUSED"))
                .mockRejectedValueOnce(new Error("ECONNREFUSED"));

            await expect(
                (service as any).sendPost("https://example.com/hook", { type: "test", data: {} })
            ).rejects.toThrow("ECONNREFUSED");

            expect(mockedAxios.post).toHaveBeenCalledTimes(3);
        });

        it("includes Authorization header when password is configured", async () => {
            mockedAxios.post.mockResolvedValueOnce({ status: 200 });

            await (service as any).sendPost("https://example.com/hook", { type: "test", data: {} });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                "https://example.com/hook",
                { type: "test", data: {} },
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: "Bearer test-password"
                    })
                })
            );
        });
    });

    describe("dispatch", () => {
        it("logs warning after all retries fail", async () => {
            mockGetWebhooks.mockResolvedValue([{ url: "https://example.com/hook", events: '["*"]' }]);
            mockedAxios.post
                .mockRejectedValueOnce(new Error("ECONNREFUSED"))
                .mockRejectedValueOnce(new Error("ECONNREFUSED"))
                .mockRejectedValueOnce(new Error("ECONNREFUSED"));

            // dispatch is async (awaits getWebhooks), but sendPost is fire-and-forget
            await service.dispatch({ type: "test-event", data: {} });

            // Wait for the fire-and-forget sendPost + catch chain to settle
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(service.log.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to dispatch"));
        });
    });
});
