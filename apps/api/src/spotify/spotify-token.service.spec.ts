import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpotifyTokenService } from "./spotify-token.service.js";

describe("SpotifyTokenService", () => {
  const cipher = {
    encrypt: (value: string) => `encrypted:${value}`,
    decrypt: (value: string) => value.replace("encrypted:", ""),
  };
  const config = new ConfigService({
    SPOTIFY_TOKEN_CACHE_SIZE: "10",
    SPOTIFY_TOKEN_CACHE_TTL_MS: "60000",
  });
  let repository: {
    delete: ReturnType<typeof vi.fn>;
    findOneBy: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let users: { findOneBy: ReturnType<typeof vi.fn> };
  let spotifyApi: { refresh: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repository = {
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: vi.fn(),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    users = {
      findOneBy: vi.fn().mockResolvedValue({ id: "user-1", spotifyAccountId: "spotify-user-1" }),
    };
    spotifyApi = { refresh: vi.fn() };
  });

  function service(): SpotifyTokenService {
    return new SpotifyTokenService(
      repository as never,
      users as never,
      spotifyApi as never,
      cipher as never,
      config
    );
  }

  it("lazy-loads on a miss and serves the next lookup from the LRU", async () => {
    repository.findOneBy.mockResolvedValue({
      accountId: "spotify-user-1",
      accessToken: "encrypted:access",
      refreshToken: "encrypted:refresh",
      expiresAt: new Date(Date.now() + 300_000),
      scopes: [],
    });
    const tokens = service();

    await expect(tokens.getValidAccessToken("user-1")).resolves.toBe("access");
    await expect(tokens.getValidAccessToken("user-1")).resolves.toBe("access");
    expect(repository.findOneBy).toHaveBeenCalledTimes(1);
  });

  it("deduplicates refreshes and writes through before updating the cache", async () => {
    spotifyApi.refresh.mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: new Date(Date.now() + 300_000),
      scopes: ["user-read-private"],
    });
    const tokens = service();
    tokens.prime({
      userId: "user-1",
      accountId: "spotify-user-1",
      accessToken: "expired",
      refreshToken: "refresh",
      expiresAt: new Date(0),
      scopes: [],
    });

    await expect(
      Promise.all([tokens.getValidAccessToken("user-1"), tokens.getValidAccessToken("user-1")])
    ).resolves.toEqual(["new-access", "new-access"]);
    expect(spotifyApi.refresh).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it("does not retain refreshed credentials when the database write fails", async () => {
    spotifyApi.refresh.mockResolvedValue({
      accessToken: "unpersisted",
      refreshToken: "new-refresh",
      expiresAt: new Date(Date.now() + 300_000),
      scopes: [],
    });
    repository.update.mockRejectedValue(new Error("database unavailable"));
    repository.findOneBy.mockResolvedValue(null);
    const tokens = service();
    tokens.prime({
      userId: "user-1",
      accountId: "spotify-user-1",
      accessToken: "expired",
      refreshToken: "refresh",
      expiresAt: new Date(0),
      scopes: [],
    });

    await expect(tokens.getValidAccessToken("user-1")).rejects.toThrow("database unavailable");
    await expect(tokens.getValidAccessToken("user-1")).rejects.toThrow("Spotify is not connected");
    expect(repository.findOneBy).toHaveBeenCalledTimes(1);
  });

  it("removes unusable credentials when Spotify rejects the refresh token", async () => {
    spotifyApi.refresh.mockRejectedValue(new UnauthorizedException("invalid refresh token"));
    const tokens = service();
    tokens.prime({
      userId: "user-1",
      accountId: "spotify-user-1",
      accessToken: "expired",
      refreshToken: "invalid",
      expiresAt: new Date(0),
      scopes: [],
    });

    await expect(tokens.getValidAccessToken("user-1")).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(repository.delete).toHaveBeenCalledWith({ accountId: "spotify-user-1" });
  });
});
