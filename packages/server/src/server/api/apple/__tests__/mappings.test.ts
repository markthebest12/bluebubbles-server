import { describe, it, expect } from "vitest";

/**
 * Tests for tapback / reaction mappings.
 *
 * The bluebubbles-server REST/socket API uses one vocabulary for tapback
 * names ("love", "like", "dislike", "laugh", "emphasize", "question") and
 * the ax-helper Swift CLI uses another ("heart", "thumbsup", "thumbsdown",
 * "haha", "emphasis", "question"). When MessageInterface.sendReaction
 * dispatches to ax-helper on macOS 26 Tahoe (bluebubbles-server#66), the
 * REST/socket name must be translated to the ax-helper name first; this
 * test pins that translation table to prevent silent drift on either side.
 */

import { reactionTextMap, negativeReactionTextMap, reactionToAxHelperType } from "../mappings";

// Authoritative list pulled from AxService.VALID_TAPBACK_TYPES (services/AxService.ts)
// — kept in this test (instead of imported) so a divergence on either side fails the
// assertion below rather than silently passing.
const AX_HELPER_VALID_TAPBACK_TYPES = ["heart", "thumbsup", "thumbsdown", "haha", "emphasis", "question"];

describe("reactionToAxHelperType", () => {
    it("covers every positive reaction in reactionTextMap", () => {
        const positiveKeys = Object.keys(reactionTextMap);
        const mappedKeys = Object.keys(reactionToAxHelperType);
        // Every REST/socket reaction must have an ax-helper mapping.
        for (const key of positiveKeys) {
            expect(mappedKeys).toContain(key);
        }
    });

    it("maps every entry to a value AxService accepts", () => {
        for (const [key, axType] of Object.entries(reactionToAxHelperType)) {
            expect(AX_HELPER_VALID_TAPBACK_TYPES, `mapping for ${key}`).toContain(axType);
        }
    });

    it("does not include negative reactions (ax-helper has no remove semantic)", () => {
        // bluebubbles-server#66: removing a tapback on Tahoe is unsupported;
        // sendReaction throws instead of silently downgrading. The mapping
        // table must not invite the opposite assumption.
        for (const negKey of Object.keys(negativeReactionTextMap)) {
            expect(reactionToAxHelperType[negKey]).toBeUndefined();
        }
    });

    it("uses exactly the expected REST/socket → ax-helper pairs", () => {
        // Pinning the table directly so an unintended rename or reorder
        // becomes a test failure with a clear diff.
        expect(reactionToAxHelperType).toEqual({
            love: "heart",
            like: "thumbsup",
            dislike: "thumbsdown",
            laugh: "haha",
            emphasize: "emphasis",
            question: "question"
        });
    });
});
