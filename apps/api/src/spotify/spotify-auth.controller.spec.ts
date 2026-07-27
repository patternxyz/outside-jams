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

  it("deletes Spotify data and invalidates cached tokens on disconnect", async () => {
    const accounts = { delete: vi.fn().mockResolvedValue({ affected: 1 }) };
    const tokenService = { invalidate: vi.fn() };
    const spotify = new SpotifyAuthController(
      new ConfigService(),
      {} as never,
      {} as never,
      tokenService as never,
      accounts as never,
      {} as never
    );

    await expect(spotify.disconnect({ session: { userId: "user-1" } } as never)).resolves.toEqual({
      connected: false,
    });
    expect(accounts.delete).toHaveBeenCalledWith({ userId: "user-1" });
    expect(tokenService.invalidate).toHaveBeenCalledWith("user-1");
  });
});
