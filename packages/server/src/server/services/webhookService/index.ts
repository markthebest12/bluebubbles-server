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
     * See bluebubbles-server#71.
     */
    maxRetries = 8;

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

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await axios.post(url, event, { headers });
            } catch (err) {
                if (attempt < maxRetries) {
                    const delay = baseDelayMs * Math.pow(2, attempt - 1);
                    this.log.debug(
                        `Webhook delivery failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${url}`
                    );
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw err;
                }
            }
        }
    }
}
