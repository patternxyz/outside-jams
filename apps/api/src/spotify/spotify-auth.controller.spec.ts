import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { SpotifyAuthController } from "./spotify-auth.controller.js";

describe("SpotifyAuthController", () => {
  function controller(apiBaseUrl?: string): SpotifyAuthController {
    return new SpotifyAuthController(
      new ConfigService({ API_BASE_URL: apiBaseUrl, SPOTIFY_CLIENT_ID: "client-id" }),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
  }

  it("starts Authorization Code with PKCE and saves state in the session", () => {
    const request = { protocol: "http", get: () => "localhost:5173", session: {} };
    const redirect = vi.fn();

    controller("https://proxy.example.test").connect(request as never, { redirect } as never);

    const target = new URL(redirect.mock.calls[0][0] as string);
    expect(target.origin).toBe("https://accounts.spotify.com");
    expect(target.searchParams.get("response_type")).toBe("code");
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("scope")).toBe("user-top-read user-follow-read");
    expect(target.searchParams.get("show_dialog")).toBe("true");
    expect(target.searchParams.get("redirect_uri")).toBe(
      "https://proxy.example.test/api/auth/spotify/callback"
    );
    expect(request.session).toHaveProperty("spotifyOAuth.state", target.searchParams.get("state"));
  });

  it("rejects a callback with missing state", async () => {
    const request = { query: { code: "code" }, session: {} };
    await expect(controller().callback(request as never, {} as never)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("rejects a callback with mismatched state", async () => {
    const request = {
      query: { code: "code", state: "wrong" },
      session: { spotifyOAuth: { codeVerifier: "verifier", state: "expected" } },
    };
    await expect(controller().callback(request as never, {} as never)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("dispatches a sync after Spotify connection and session persistence succeed", async () => {
    const spotifyApi = {
      exchangeCode: vi.fn().mockResolvedValue({ accessToken: "token" }),
      getProfile: vi.fn().mockResolvedValue({ id: "spotify-user", displayName: "Listener" }),
    };
    const identity = { provision: vi.fn().mockResolvedValue("user-id") };
    const syncCoordinator = { queue: vi.fn().mockResolvedValue(undefined) };
    const session = {
      spotifyOAuth: { codeVerifier: "verifier", state: "expected" },
      regenerate: (callback: (error?: Error) => void) => callback(),
      save: (callback: (error?: Error) => void) => callback(),
      userId: undefined as string | undefined,
    };
    const response = { redirect: vi.fn() };
    const spotify = new SpotifyAuthController(
      new ConfigService({ API_BASE_URL: "https://api.example.test" }),
      spotifyApi as never,
      identity as never,
      syncCoordinator as never,
      {} as never,
      {} as never,
      {} as never
    );

    await spotify.callback(
      { query: { code: "code", state: "expected" }, session } as never,
      response as never
    );

    expect(session.userId).toBe("user-id");
    expect(syncCoordinator.queue).toHaveBeenCalledWith("user-id");
    expect(response.redirect).toHaveBeenCalledWith("/?spotify=connected");
  });

  it("returns sync progress for the connected account", async () => {
    const users = {
      findOneBy: vi.fn().mockResolvedValue({ spotifyAccountId: "spotify-user" }),
    };
    const accounts = {
      findOneBy: vi.fn().mockResolvedValue({
        lastSyncStatus: "started",
        lastUpdate: "Fetched 20 top artists",
      }),
    };
    const spotify = new SpotifyAuthController(
      new ConfigService(),
      {} as never,
      {} as never,
      {} as never,
      accounts as never,
      {} as never,
      users as never
    );

    await expect(spotify.syncStatus({ session: { userId: "user-id" } } as never)).resolves.toEqual({
      lastSyncStatus: "started",
      lastUpdate: "Fetched 20 top artists",
    });
  });

  it("deletes Spotify data and invalidates cached tokens on disconnect", async () => {
    const identity = { disconnect: vi.fn().mockResolvedValue(undefined) };
    const spotify = new SpotifyAuthController(
      new ConfigService(),
      {} as never,
      identity as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    const request = { session: { userId: "user-1" as string | undefined } };

    await expect(spotify.disconnect(request as never)).resolves.toEqual({
      connected: false,
    });
    expect(identity.disconnect).toHaveBeenCalledWith("user-1");
    expect(request.session.userId).toBeUndefined();
  });
});
