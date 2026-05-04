import axios from "axios";
import { Server } from "@server";
import { Loggable } from "@server/lib/logging/Loggable";

export type WebhookEvent = {
    type: string;
    data: any;
};

/**
 * Handles dispatching webhooks
 */
export class WebhookService extends Loggable {
    tag = "WebhookService";

    /** Base delay in ms for exponential backoff. Override in tests. */
    retryBaseDelayMs = 1000;

    /**
     * Maximum delivery attempts before giving up. Override in tests.
     * 8 attempts spread over 1+2+4+8+16+32+64+128 ≈ 255s of backoff covers
     * a typical openclaw gateway restart (15-30s) with ample margin.
     * Hard-capped at 20 to bound `Math.pow(2, attempt - 1)` and avoid the
     * `setTimeout` int32 overflow at ~24.8 days.
     * See bluebubbles-server#71.
     */
    private _maxRetries = 8;
    get maxRetries(): number {
        return this._maxRetries;
    }
    set maxRetries(value: number) {
        if (!Number.isInteger(value) || value < 1 || value > 20) {
            throw new RangeError(`maxRetries must be an integer in [1, 20], got ${value}`);
        }
        this._maxRetries = value;
    }

    /**
     * Jitter factor applied to each backoff delay. Default 0.2 means the
     * computed delay is multiplied by a random factor in [1.0, 1.2). This
     * desynchronizes recovery on bursty restart cascades — without it,
     * dozens of in-flight retry chains fired at t=0 would all wake on the
     * same exponential boundary and pile-drive the gateway. 0 disables.
     */
    retryJitterFactor = 0.2;

    async dispatch(event: WebhookEvent) {
        const webhooks = await Server().repo.getWebhooks();
        for (const i of webhooks) {
            const eventTypes = JSON.parse(i.events) as Array<string>;
            if (!eventTypes.includes("*") && !eventTypes.includes(event.type)) continue;
            this.log.debug(`Dispatching event to webhook: ${i.url}`);

            // We don't need to await this
            this.sendPost(i.url, event).catch(ex => {
                this.log.warn(`Failed to dispatch "${event.type}" event to webhook after retries: ${i.url}`);
                this.log.warn(`  -> Error: ${ex?.message ?? String(ex)}`);
                if (ex?.response?.statusText) {
                    this.log.warn(`  -> Status Text: ${ex.response.statusText}`);
                }
            });
        }
    }

    private async sendPost(url: string, event: WebhookEvent) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const password = Server().repo.getConfig("password") as string;
        if (password) {
            headers["Authorization"] = `Bearer ${password}`;
        }

        const maxRetries = this.maxRetries;
        const baseDelayMs = this.retryBaseDelayMs;
        const jitter = this.retryJitterFactor;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await axios.post(url, event, { headers });
            } catch (err) {
                // 4xx (except 429) are permanent — retrying for 255s blocks
                // the slot for a misconfigured webhook with no chance of
                // success. 429 is rate-limit-style and SHOULD retry. The
                // gateway-restart case (ECONNREFUSED / ETIMEDOUT / 5xx) has
                // no err.response.status and falls through to retry.
                const status = (err as { response?: { status?: number } })?.response?.status;
                const isPermanent = typeof status === "number" && status >= 400 && status < 500 && status !== 429;
                if (isPermanent || attempt >= maxRetries) {
                    throw err;
                }
                const baseDelay = baseDelayMs * Math.pow(2, attempt - 1);
                const delay = jitter > 0 ? Math.floor(baseDelay * (1 + Math.random() * jitter)) : baseDelay;
                this.log.debug(
                    `Webhook delivery failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${url}`
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}
