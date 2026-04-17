import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @server to avoid Electron dependency chain (use alias and source paths)
vi.mock("@server", () => ({
    Server: () => ({
        log: vi.fn()
    })
}));

// Mock Loggable to break circular dep chain.
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

import plist from "plist";
import { AudioTranscriptService } from "../audioTranscriptService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an XML plist Buffer from a plain JS object (test fixture helper). */
function buildPlistBuffer(obj: Record<string, unknown>): Buffer {
    return Buffer.from(plist.build(obj as any));
}

/** Build a mock fetchRawUserInfo that returns the provided buffer. */
function makeFetcher(buffer: Buffer | null): (guid: string) => Promise<Buffer | null> {
    return vi.fn().mockResolvedValue(buffer);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AudioTranscriptService", () => {
    let fetcher: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // 1. Happy path — valid audio plist with transcript
    // -----------------------------------------------------------------------
    describe("getTranscript — valid audio plist with transcript", () => {
        it("returns ok:true with transcript, uti, and filename", async () => {
            const buf = buildPlistBuffer({
                "audio-transcription": "Hey, are you coming tonight?",
                "uti-type": "com.apple.coreaudio-format",
                name: "Audio Message.caf",
                "file-size": 48210
            });
            fetcher = makeFetcher(buf);
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("abc-123_GUID");

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error("narrowing");
            expect(result.transcript).toBe("Hey, are you coming tonight?");
            expect(result.uti).toBe("com.apple.coreaudio-format");
            expect(result.filename).toBe("Audio Message.caf");
            expect(result.guid).toBe("abc-123_GUID");
        });
    });

    // -----------------------------------------------------------------------
    // 2. Plist without transcription key
    // -----------------------------------------------------------------------
    describe("getTranscript — audio plist without transcription key", () => {
        it("returns ok:false with error:no_transcription and preserves uti", async () => {
            const buf = buildPlistBuffer({
                "uti-type": "com.apple.coreaudio-format",
                name: "Audio Message.caf",
                "file-size": 1024
                // no "audio-transcription" key
            });
            fetcher = makeFetcher(buf);
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("some-guid-99");

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("narrowing");
            expect(result.error).toBe("no_transcription");
            expect(result.guid).toBe("some-guid-99");
            expect(result.uti).toBe("com.apple.coreaudio-format");
        });
    });

    // -----------------------------------------------------------------------
    // 3. fetchRawUserInfo returns null (attachment not found)
    // -----------------------------------------------------------------------
    describe("getTranscript — fetchRawUserInfo returns null", () => {
        it("returns ok:false with error:not_found", async () => {
            fetcher = makeFetcher(null);
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("valid-guid-42");

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("narrowing");
            expect(result.error).toBe("not_found");
            expect(result.guid).toBe("valid-guid-42");
        });
    });

    // -----------------------------------------------------------------------
    // 4. Invalid guid — fetchRawUserInfo must NOT be called
    // -----------------------------------------------------------------------
    describe("getTranscript — invalid guid", () => {
        it("returns ok:false with error:invalid_guid without calling fetcher", async () => {
            fetcher = vi.fn();
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("bad/guid/with/slashes");

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("narrowing");
            expect(result.error).toBe("invalid_guid");
            expect(fetcher).not.toHaveBeenCalled();
        });

        it("rejects empty string guid without calling fetcher", async () => {
            fetcher = vi.fn();
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("");

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("narrowing");
            expect(result.error).toBe("invalid_guid");
            expect(fetcher).not.toHaveBeenCalled();
        });

        it("rejects guid longer than 128 chars without calling fetcher", async () => {
            fetcher = vi.fn();
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });
            const longGuid = "a".repeat(129);

            const result = await service.getTranscript(longGuid);

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("narrowing");
            expect(result.error).toBe("invalid_guid");
            expect(fetcher).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // 5. Bogus bytes — not a plist at all
    // -----------------------------------------------------------------------
    describe("getTranscript — bogus bytes (not a plist)", () => {
        it("returns ok:false with error:invalid_plist", async () => {
            const buf = Buffer.from("this is definitely not a plist");
            fetcher = makeFetcher(buf);
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("guid-bogus-bytes");

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("narrowing");
            expect(result.error).toBe("invalid_plist");
            expect(result.guid).toBe("guid-bogus-bytes");
        });
    });

    // -----------------------------------------------------------------------
    // 6. Plist decodes to an array instead of a dict
    // -----------------------------------------------------------------------
    describe("getTranscript — plist decodes to array", () => {
        it("returns ok:false with error:invalid_plist", async () => {
            // plist.build() on an array produces a valid plist whose root is an array
            const buf = Buffer.from(plist.build(["item-one", "item-two"] as any));
            fetcher = makeFetcher(buf);
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("guid-array-plist");

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("narrowing");
            expect(result.error).toBe("invalid_plist");
        });
    });

    // -----------------------------------------------------------------------
    // 7. audio-transcription is empty string
    // -----------------------------------------------------------------------
    describe("getTranscript — empty audio-transcription string", () => {
        it("returns ok:false with error:no_transcription", async () => {
            const buf = buildPlistBuffer({
                "audio-transcription": "",
                "uti-type": "com.apple.coreaudio-format"
            });
            fetcher = makeFetcher(buf);
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("guid-empty-transcript");

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("narrowing");
            expect(result.error).toBe("no_transcription");
            expect(result.uti).toBe("com.apple.coreaudio-format");
        });
    });

    // -----------------------------------------------------------------------
    // 8. Optional fields: uti and filename omitted when not in plist
    // -----------------------------------------------------------------------
    describe("getTranscript — transcript present but no uti or filename", () => {
        it("returns ok:true without uti or filename keys", async () => {
            const buf = buildPlistBuffer({
                "audio-transcription": "Just the text, no metadata."
            });
            fetcher = makeFetcher(buf);
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("guid-no-meta");

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error("narrowing");
            expect(result.transcript).toBe("Just the text, no metadata.");
            expect("uti" in result).toBe(false);
            expect("filename" in result).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // 9. fetchRawUserInfo throws — must return fetch_error, not not_found
    // -----------------------------------------------------------------------
    describe("getTranscript — fetchRawUserInfo throws", () => {
        it("returns ok:false with error:fetch_error when fetcher rejects", async () => {
            fetcher = vi.fn().mockRejectedValue(new Error("DB locked"));
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("guid-db-error");

            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("narrowing");
            expect(result.error).toBe("fetch_error");
            expect(result.guid).toBe("guid-db-error");
        });
    });

    // -----------------------------------------------------------------------
    // 10. Binary plist (bplist00) path — primary production format
    // -----------------------------------------------------------------------
    describe("getTranscript — binary plist (bplist00) input", () => {
        it("returns ok:true decoding a real binary plist buffer", async () => {
            // Generated via: python3 -c 'import plistlib,sys; sys.stdout.buffer.write(
            //   plistlib.dumps({"audio-transcription":"Hi there","uti-type":
            //   "com.apple.coreaudio-format","name":"Audio Message.caf"},
            //   fmt=plistlib.FMT_BINARY))' | xxd -i
            const binaryPlistBuf = Buffer.from([
                0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30, 0xd3, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x5f, 0x10,
                0x13, 0x61, 0x75, 0x64, 0x69, 0x6f, 0x2d, 0x74, 0x72, 0x61, 0x6e, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74,
                0x69, 0x6f, 0x6e, 0x54, 0x6e, 0x61, 0x6d, 0x65, 0x58, 0x75, 0x74, 0x69, 0x2d, 0x74, 0x79, 0x70, 0x65,
                0x58, 0x48, 0x69, 0x20, 0x74, 0x68, 0x65, 0x72, 0x65, 0x5f, 0x10, 0x11, 0x41, 0x75, 0x64, 0x69, 0x6f,
                0x20, 0x4d, 0x65, 0x73, 0x73, 0x61, 0x67, 0x65, 0x2e, 0x63, 0x61, 0x66, 0x5f, 0x10, 0x1a, 0x63, 0x6f,
                0x6d, 0x2e, 0x61, 0x70, 0x70, 0x6c, 0x65, 0x2e, 0x63, 0x6f, 0x72, 0x65, 0x61, 0x75, 0x64, 0x69, 0x6f,
                0x2d, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x08, 0x0f, 0x25, 0x2a, 0x33, 0x3c, 0x50, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x6d
            ]);
            fetcher = makeFetcher(binaryPlistBuf);
            const service = new AudioTranscriptService({ fetchRawUserInfo: fetcher });

            const result = await service.getTranscript("guid-binary-plist");

            expect(result.ok).toBe(true);
            if (!result.ok) throw new Error("narrowing");
            expect(result.transcript).toBe("Hi there");
            expect(result.uti).toBe("com.apple.coreaudio-format");
            expect(result.filename).toBe("Audio Message.caf");
            expect(result.guid).toBe("guid-binary-plist");
        });
    });
});
