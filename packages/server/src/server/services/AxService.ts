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
const TRACE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

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
        const fullArgs = [...args];
        if (traceId && TRACE_ID_PATTERN.test(traceId)) {
            fullArgs.push("--trace-id", traceId);
        }

        await this.queue.acquire();
        try {
            return await this.exec(fullArgs);
        } finally {
            this.queue.release();
        }
    }

    private exec(args: string[]): Promise<AxResult> {
        return new Promise((resolve, reject) => {
            execFile(this.binaryPath, args, { timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
                if (stderr) {
                    const level = error ? "warn" : "debug";
                    this.log[level](`ax-helper stderr: ${stderr.trim()}`);
                }

                // Try to parse stdout as JSON regardless of exit code
                if (stdout && stdout.trim().length > 0) {
                    try {
                        const result = JSON.parse(stdout) as AxResult;
                        if (!result.ok) {
                            reject(new Error(result.error ?? "ax-helper operation failed"));
                            return;
                        }
                        resolve(result);
                        return;
                    } catch {
                        this.log.warn(`ax-helper stdout not valid JSON: ${stdout.substring(0, 200)}`);
                    }
                }

                if (error) {
                    const isTimeout =
                        (error as any).killed === true ||
                        (error as any).code === "ETIMEDOUT" ||
                        (error as any).signal === "SIGTERM";
                    reject(new Error(isTimeout ? "timeout" : "ax-helper execution failed"));
                    return;
                }

                reject(new Error("ax-helper returned no output"));
            });
        });
    }
}
