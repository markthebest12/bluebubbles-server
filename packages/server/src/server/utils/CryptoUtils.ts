import { createHash, randomBytes } from "crypto";

export const generateMd5Hash = (data: Buffer): string => {
    return createHash("md5")
        .update(data as unknown as Uint8Array)
        .digest("hex");
};

export const generateRandomString = (length: number): string => {
    return randomBytes(Math.ceil(length / 2)).toString("hex");
};
