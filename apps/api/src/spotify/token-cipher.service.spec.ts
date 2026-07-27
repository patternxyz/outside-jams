import { randomBytes } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { TokenCipherService } from "./token-cipher.service.js";

describe("TokenCipherService", () => {
  it("round-trips a token without storing plaintext", () => {
    const config = new ConfigService({ TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
    const cipher = new TokenCipherService(config);
    const encrypted = cipher.encrypt("provider-secret");

    expect(encrypted).not.toContain("provider-secret");
    expect(cipher.decrypt(encrypted)).toBe("provider-secret");
  });
});
