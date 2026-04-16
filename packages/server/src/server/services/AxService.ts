import { execFile } from "child_process";
import { Sema } from "async-sema";
import { Loggable } from "../lib/logging/Loggable";

export interface AxResult {
    ok: boolean;
    op: string;
    type?: string;
    direction?: string;
    error?: string;
    ms?: number;
    trace?: string;
    menuItems?: Record<string, string>;
}

const VALID_TAPBACK_TYPES = ["heart", "thumbsup", "thumbsdown", "haha", "emphasis", "question"];
const VALID_DIRECTIONS = ["next", "prev"];
const TIMEOUT_MS = 5000;

export class AxService extends Loggable {
    tag = "AxService";

    readonly binaryPath: string;

    private readonly queue = new Sema(1);

    constructor(binaryPath: string) {
        super();
        this.binaryPath = binaryPath;
    }

    async tapback(type: string, traceId?: string): Promise<AxResult> {
        if (!VALID_TAPBACK_TYPES.includes(type)) {
            throw new Error(`Invalid tapback type: ${type}. Valid: ${VALID_TAPBACK_TYPES.join(", ")}`);
        }
        return this.run(["tapback", type], traceId);
    }

    async markRead(traceId?: string): Promise<AxResult> {
        return this.run(["mark-read"], traceId);
    }

    async navigate(direction: string, traceId?: string): Promise<AxResult> {
        if (!VALID_DIRECTIONS.includes(direction)) {
            throw new Error(`Invalid direction: ${direction}. Valid: ${VALID_DIRECTIONS.join(", ")}`);
        }
        return this.run(["navigate", direction], traceId);
    }

    async check(traceId?: string): Promise<AxResult> {
        return this.run(["check"], traceId);
    }

    private async run(args: string[], traceId?: string): Promise<AxResult> {
        if (traceId) {
            args.push("--trace-id", traceId);
        }

        await this.queue.acquire();
        try {
            return await this.exec(args);
        } finally {
            this.queue.release();
        }
    }

    private exec(args: string[]): Promise<AxResult> {
        return new Promise(resolve => {
            execFile(this.binaryPath, args, { timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
                if (stderr) {
                    this.log.warn(`ax-helper stderr: ${stderr.trim()}`);
                }

                // Try to parse stdout as JSON regardless of exit code
                if (stdout && stdout.trim().length > 0) {
                    try {
                        const result = JSON.parse(stdout) as AxResult;
                        resolve(result);
                        return;
                    } catch {
                        // stdout not valid JSON — fall through to error handling
                    }
                }

                if (error) {
                    const isTimeout = (error as any).killed === true;
                    resolve({
                        ok: false,
                        op: args[0] || "unknown",
                        error: isTimeout ? "timeout" : `exec_error: ${error.message}`
                    });
                    return;
                }

                resolve({
                    ok: false,
                    op: args[0] || "unknown",
                    error: "no_output"
                });
            });
        });
    }
}
