import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");

const mockGetWebhooks = vi.fn().mockResolvedValue([]);
const mockGetConfig = vi.fn().mockReturnValue("test-password");

vi.mock("@server", () => ({
    Server: () => ({
        repo: {
            getWebhooks: mockGetWebhooks,
            getConfig: mockGetConfig
        }
    })
}));

vi.mock("@server/lib/logging/Loggable", () => ({
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
        // Use 0ms delay in tests so retries resolve instantly.
        service.retryBaseDelayMs = 0;
        // Disable jitter for deterministic assertions on log lines.
        service.retryJitterFactor = 0;
        // Tighten retry budget to 3 in tests so existing assertions still
        // pin a small, deterministic number — the production budget is 8
        // (see bluebubbles-server#71). Tests for the larger budget set
        // service.maxRetries explicitly.
        service.maxRetries = 3;
        // Restore default mock behavior after clearAllMocks
        mockGetWebhooks.mockResolvedValue([]);
        mockGetConfig.mockReturnValue("test-password");
    });

    /** Build an axios-style error with an HTTP status attached. */
    const httpError = (status: number, message = `Request failed with ${status}`): Error => {
        const err: Error & { response?: { status: number } } = new Error(message);
        err.response = { status };
        return err;
    };

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

        it("uses default maxRetries=8 when not overridden (bluebubbles-server#71)", () => {
            // Construct fresh — no override of maxRetries — and assert the
            // production budget. The beforeEach above sets maxRetries=3 only
            // to tighten existing tests; this asserts the shipped default.
            const fresh = new WebhookService();
            expect(fresh.maxRetries).toBe(8);
        });

        it("succeeds on the 8th attempt under the production retry budget", async () => {
            service.maxRetries = 8;
            // Reject 7 times, succeed on the 8th — proves the production
            // budget can actually deliver after 7 failures. Total clock
            // time would be 1+2+4+8+16+32+64+128 ≈ 255s in production;
            // here retryBaseDelayMs is 0 so the test runs instantly. The
            // budget arithmetic itself is documented on `maxRetries` in
            // the implementation, not asserted here.
            for (let i = 0; i < 7; i++) {
                mockedAxios.post.mockRejectedValueOnce(new Error("ECONNREFUSED"));
            }
            mockedAxios.post.mockResolvedValueOnce({ status: 200 });

            await (service as any).sendPost("https://example.com/hook", { type: "test", data: {} });

            expect(mockedAxios.post).toHaveBeenCalledTimes(8);
            expect(service.log.debug).toHaveBeenCalledWith(expect.stringContaining("attempt 7/8"));
        });

        it("does NOT retry on 4xx (permanent client error)", async () => {
            // 401/404/400 mean the webhook target is misconfigured. Retrying
            // for 255s blocks the slot with no chance of success. PR review
            // finding (#72) — bluebubbles-server#71.
            mockedAxios.post.mockRejectedValueOnce(httpError(401, "Unauthorized"));

            await expect(
                (service as any).sendPost("https://example.com/hook", { type: "test", data: {} })
            ).rejects.toThrow("Unauthorized");

            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        });

        it("DOES retry on 429 (rate-limited)", async () => {
            // 429 is the one 4xx that's transient — the server is asking us
            // to back off, not refusing the request shape.
            mockedAxios.post
                .mockRejectedValueOnce(httpError(429, "Too Many Requests"))
                .mockResolvedValueOnce({ status: 200 });

            await (service as any).sendPost("https://example.com/hook", { type: "test", data: {} });

            expect(mockedAxios.post).toHaveBeenCalledTimes(2);
        });

        it("DOES retry on 5xx (transient server error)", async () => {
            mockedAxios.post
                .mockRejectedValueOnce(httpError(503, "Service Unavailable"))
                .mockResolvedValueOnce({ status: 200 });

            await (service as any).sendPost("https://example.com/hook", { type: "test", data: {} });

            expect(mockedAxios.post).toHaveBeenCalledTimes(2);
        });

        it("rejects invalid maxRetries values", () => {
            // maxRetries setter validates input — protects against
            // Math.pow(2, attempt-1) overflow at large values and against
            // accidental zero/negative misconfiguration.
            expect(() => {
                service.maxRetries = 0;
            }).toThrow(RangeError);
            expect(() => {
                service.maxRetries = -1;
            }).toThrow(RangeError);
            expect(() => {
                service.maxRetries = 21;
            }).toThrow(RangeError);
            expect(() => {
                service.maxRetries = 1.5;
            }).toThrow(RangeError);
            expect(() => {
                service.maxRetries = 8;
            }).not.toThrow();
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

            // dispatch is async (awaits getWebhooks), but sendPost is fire-and-forget.
            await service.dispatch({ type: "test-event", data: {} });

            // Poll for the fire-and-forget catch chain to settle. vi.waitFor
            // retries the assertion on a short interval until it passes or
            // the default timeout fires — replaces a brittle fixed-50ms wait.
            await vi.waitFor(() => {
                expect(service.log.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to dispatch"));
            });
        });
    });
});
