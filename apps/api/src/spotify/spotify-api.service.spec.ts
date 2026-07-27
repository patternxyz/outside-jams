import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpotifyApiService } from "./spotify-api.service.js";

describe("SpotifyApiService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves the current refresh token when Spotify omits a replacement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ access_token: "next-access", expires_in: 3600, scope: "profile" }),
      })
    );
    const service = new SpotifyApiService(
      new ConfigService({ SPOTIFY_CLIENT_ID: "client", SPOTIFY_CLIENT_SECRET: "secret" })
    );

    await expect(service.refresh("current-refresh")).resolves.toMatchObject({
      accessToken: "next-access",
      refreshToken: "current-refresh",
      scopes: ["profile"],
    });
  });
});
