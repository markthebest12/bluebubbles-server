export const negativeReactionTextMap: NodeJS.Dict<string> = {
    "-love": "Removed a heart",
    "-like": "Removed a like",
    "-dislike": "Removed a dislike",
    "-laugh": "Removed a laugh",
    "-emphasize": "Removed an exclamation",
    "-question": "Removed a question mark"
};

export const reactionTextMap: NodeJS.Dict<string> = {
    love: "Loved",
    like: "Liked",
    dislike: "Disliked",
    laugh: "Laughed at",
    emphasize: "Emphasized",
    question: "Questioned"
};

export const tapbackUIMap: NodeJS.Dict<number> = {
    love: 1,
    like: 2,
    dislike: 3,
    laugh: 4,
    emphasize: 5,
    question: 6
};

// Maps the iMessage REST/socket reaction names to the ax-helper Swift CLI's
// VALID_TAPBACK_TYPES vocabulary. Used by sendReaction() when routing
// to ax-helper on macOS 26 (Tahoe), where the Private API DYLIB path is
// blocked by Launch Constraints. Negative reactions (`-love`, etc.) are
// intentionally absent — ax-helper has no remove-tapback semantic and
// callers must surface that as an explicit error to the requester.
// See bluebubbles-server#66.
export const reactionToAxHelperType: NodeJS.Dict<string> = {
    love: "heart",
    like: "thumbsup",
    dislike: "thumbsdown",
    laugh: "haha",
    emphasize: "emphasis",
    question: "question"
};
