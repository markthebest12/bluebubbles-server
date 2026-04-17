import plist from "plist";
import bplistParser from "bplist-parser";
import { Loggable } from "@server/lib/logging/Loggable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AudioTranscriptErrorCode =
    | "invalid_guid"
    | "not_found"
    | "fetch_error"
    | "no_transcription"
    | "invalid_plist";

export type AudioTranscriptResult =
    | { ok: true; guid: string; transcript: string; uti?: string; filename?: string }
    | { ok: false; guid?: string; error: AudioTranscriptErrorCode; uti?: string };

type Deps = {
    fetchRawUserInfo: (guid: string) => Promise<Buffer | null>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Allowable attachment GUIDs: alphanumeric, dash, underscore, 1–128 chars.
 * Matches the same character set as iMessage-generated GUIDs while rejecting
 * path-traversal and injection payloads.
 */
const GUID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Magic bytes that identify Apple's binary plist format. */
const BPLIST_MAGIC = Buffer.from("bplist00");

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Reads Apple's on-device voice-message transcription from the
 * `attachment.user_info` column in Messages' chat.db.
 *
 * The column is a binary plist (`bplist00`) on macOS Tahoe and later.
 * This service does not interact with the database directly — callers supply
 * a `fetchRawUserInfo` callback, which keeps the class fully testable without
 * a live DB connection.
 */
export class AudioTranscriptService extends Loggable {
    tag = "AudioTranscriptService";

    private readonly fetchRawUserInfo: Deps["fetchRawUserInfo"];

    constructor(deps: Deps) {
        super();
        this.fetchRawUserInfo = deps.fetchRawUserInfo;
    }

    async getTranscript(guid: string): Promise<AudioTranscriptResult> {
        // 1. Validate GUID before touching the DB.
        if (!GUID_PATTERN.test(guid)) {
            return { ok: false, error: "invalid_guid" };
        }

        // 2. Fetch raw bytes from the DB.
        let rawBuffer: Buffer | null;
        try {
            rawBuffer = await this.fetchRawUserInfo(guid);
        } catch (err) {
            this.log.error(`fetchRawUserInfo threw for guid=${guid}: ${err}`);
            return { ok: false, guid, error: "fetch_error" };
        }

        if (rawBuffer === null) {
            return { ok: false, guid, error: "not_found" };
        }

        // 3. Decode the plist.
        let decoded: unknown;
        try {
            decoded = this.decodePlist(rawBuffer);
        } catch {
            return { ok: false, guid, error: "invalid_plist" };
        }

        // 4. Validate shape — must be a plain dict (object, not array).
        if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
            return { ok: false, guid, error: "invalid_plist" };
        }

        const dict = decoded as Record<string, unknown>;

        // 5. Extract optional uti for error responses.
        const utiValue =
            typeof dict["uti-type"] === "string" && dict["uti-type"] !== "" ? (dict["uti-type"] as string) : undefined;

        // 6. Check for transcript.
        const transcriptValue = dict["audio-transcription"];
        if (typeof transcriptValue !== "string" || transcriptValue === "") {
            return { ok: false, guid, error: "no_transcription", ...(utiValue !== undefined ? { uti: utiValue } : {}) };
        }

        // 7. Extract optional filename.
        const filenameValue =
            typeof dict["name"] === "string" && dict["name"] !== "" ? (dict["name"] as string) : undefined;

        return {
            ok: true,
            guid,
            transcript: transcriptValue,
            ...(utiValue !== undefined ? { uti: utiValue } : {}),
            ...(filenameValue !== undefined ? { filename: filenameValue } : {})
        };
    }

    /**
     * Decode a plist buffer that may be either binary (`bplist00`) or XML.
     *
     * - Binary: delegates to `bplist-parser` which returns `[result]`.
     * - XML: delegates to the `plist` package which returns the root value.
     *
     * Throws on malformed input so the caller can convert to `invalid_plist`.
     */
    private decodePlist(buffer: Buffer): unknown {
        const isBinary =
            buffer.length >= BPLIST_MAGIC.length &&
            buffer.toString("latin1", 0, BPLIST_MAGIC.length) === BPLIST_MAGIC.toString("latin1");

        if (isBinary) {
            // bplist-parser.parseBuffer returns [rootObject]
            const results = bplistParser.parseBuffer(buffer) as unknown[];
            return results[0];
        }

        // XML plist — plist.parse expects a string
        return plist.parse(buffer.toString("utf8"));
    }
}
