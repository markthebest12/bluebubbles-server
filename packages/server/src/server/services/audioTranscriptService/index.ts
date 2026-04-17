import plist from "plist";
import bplistParser from "bplist-parser";
import { Loggable } from "@server/lib/logging/Loggable";

// Tighten bplist-parser's default 100MB object size and 32768 object count — a
// transcription plist is small (a handful of string + data keys). Preventing
// large allocations is defense-in-depth against adversarial chat.db contents.
(bplistParser as any).maxObjectSize = 1 * 1024 * 1024; // 1 MB
(bplistParser as any).maxObjectCount = 256;

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

// Apple's on-device transcription engine produces short-to-medium speech-to-text strings.
// 64 KB is generous for any realistic voice note; anomalous larger values are either corruption
// or adversarial. Treat as no_transcription (the data is unusable) rather than success.
const MAX_TRANSCRIPT_BYTES = 64 * 1024;

/** Maximum byte length for metadata string fields (uti, filename). Fields exceeding this are dropped. */
const MAX_METADATA_BYTES = 512;

/** Maximum byte length for an XML plist before we refuse to parse it. */
const MAX_XML_PLIST_BYTES = 1 * 1024 * 1024; // 1 MB

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
            const errMsg = err instanceof Error ? err.message : String(err);
            this.log.error(`fetchRawUserInfo threw for guid=${guid}: ${errMsg}`);
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

        // Prototype-safe dict: strips the prototype to prevent a future refactor from
        // accidentally reading inherited properties via dynamic key access.
        const dict = Object.assign(Object.create(null) as Record<string, unknown>, decoded as Record<string, unknown>);

        // 5. Extract optional uti for error responses — clamped to MAX_METADATA_BYTES.
        const rawUti =
            typeof dict["uti-type"] === "string" && dict["uti-type"] !== "" ? (dict["uti-type"] as string) : undefined;
        const utiValue =
            rawUti !== undefined && Buffer.byteLength(rawUti, "utf8") <= MAX_METADATA_BYTES ? rawUti : undefined;

        // 6. Check for transcript.
        const transcriptValue = dict["audio-transcription"];
        if (typeof transcriptValue !== "string" || transcriptValue === "") {
            return { ok: false, guid, error: "no_transcription", ...(utiValue !== undefined ? { uti: utiValue } : {}) };
        }

        // Reject oversized transcripts — likely corruption or adversarial input.
        if (Buffer.byteLength(transcriptValue, "utf8") > MAX_TRANSCRIPT_BYTES) {
            return { ok: false, guid, error: "no_transcription", ...(utiValue !== undefined ? { uti: utiValue } : {}) };
        }

        // 7. Extract optional filename — clamped to MAX_METADATA_BYTES.
        const rawFilename =
            typeof dict["name"] === "string" && dict["name"] !== "" ? (dict["name"] as string) : undefined;
        const filenameValue =
            rawFilename !== undefined && Buffer.byteLength(rawFilename, "utf8") <= MAX_METADATA_BYTES
                ? rawFilename
                : undefined;

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
            // bplist-parser.parseBuffer returns [rootObject]; destructuring makes the
            // single-element assumption explicit and preserves the library's declared type.
            const [parsed] = bplistParser.parseBuffer(buffer);
            return parsed;
        }

        // XML plist — plist.parse expects a string. Reject oversized buffers before parsing
        // to prevent unbounded allocations from adversarial input.
        if (buffer.length > MAX_XML_PLIST_BYTES) {
            throw new Error("plist too large");
        }
        return plist.parse(buffer.toString("utf8"));
    }
}
