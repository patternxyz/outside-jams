import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpotifyApiService } from "./spotify-api.service.js";

describe("SpotifyApiService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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

  it("maps the current user's name and first profile image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "spotify-user",
            display_name: " Listener ",
            images: [
              { url: "https://i.scdn.co/image/profile-large" },
              { url: "https://i.scdn.co/image/profile-small" },
            ],
          }),
      })
    );
    const service = new SpotifyApiService(
      new ConfigService({ SPOTIFY_CLIENT_ID: "client", SPOTIFY_CLIENT_SECRET: "secret" })
    );

    await expect(service.getProfile("access-token")).resolves.toEqual({
      id: "spotify-user",
      displayName: "Listener",
      image: "https://i.scdn.co/image/profile-large",
    });
  });

  it("loads every long-term top artist page with a limit of 50", async () => {
    const next =
      "https://api.spotify.com/v1/me/top/artists?time_range=long_term&limit=50&offset=50";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: "artist-1", name: "Artist One" }], next }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              { id: "artist-2", name: " Artist Two " },
              { id: "artist-1", name: "Artist One" },
            ],
            next: null,
          }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const service = new SpotifyApiService(
      new ConfigService({ SPOTIFY_CLIENT_ID: "client", SPOTIFY_CLIENT_SECRET: "secret" })
    );

    await expect(service.getTopArtists("access-token")).resolves.toEqual([
      { id: "artist-1", name: "Artist One" },
      { id: "artist-2", name: "Artist Two" },
    ]);

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(firstUrl.pathname).toBe("/v1/me/top/artists");
    expect(firstUrl.searchParams.get("limit")).toBe("50");
    expect(firstUrl.searchParams.get("time_range")).toBe("long_term");
    expect(fetchMock.mock.calls[1][0].toString()).toBe(next);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("waits for Spotify's Retry-After duration before retrying a rate-limited page", async () => {
    vi.useFakeTimers();
    const headers = { get: vi.fn().mockReturnValue("2") };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: [{ id: "artist-1" }], next: null }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const service = new SpotifyApiService(
      new ConfigService({ SPOTIFY_CLIENT_ID: "client", SPOTIFY_CLIENT_SECRET: "secret" })
    );

    const topArtists = service.getTopArtists("access-token");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(topArtists).resolves.toEqual([{ id: "artist-1", name: null }]);
    expect(headers.get).toHaveBeenCalledWith("retry-after");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads every followed artist page with a limit of 50", async () => {
    const next = "https://api.spotify.com/v1/me/following?type=artist&limit=50&after=artist-1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artists: { items: [{ id: "artist-1", name: "Artist One" }], next },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artists: { items: [{ id: "artist-2", name: "Artist Two" }], next: null },
          }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const service = new SpotifyApiService(
      new ConfigService({ SPOTIFY_CLIENT_ID: "client", SPOTIFY_CLIENT_SECRET: "secret" })
    );

    await expect(service.getFollowedArtists("access-token")).resolves.toEqual([
      { id: "artist-1", name: "Artist One" },
      { id: "artist-2", name: "Artist Two" },
    ]);

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(firstUrl.pathname).toBe("/v1/me/following");
    expect(firstUrl.searchParams.get("type")).toBe("artist");
    expect(firstUrl.searchParams.get("limit")).toBe("50");
    expect(fetchMock.mock.calls[1][0].toString()).toBe(next);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads every saved track page and keeps each track's distinct artists", async () => {
    const next = "https://api.spotify.com/v1/me/tracks?limit=50&offset=50";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                track: {
                  id: "track-1",
                  artists: [
                    { id: "artist-1", name: "Artist One" },
                    { id: "artist-2", name: "Artist Two" },
                  ],
                },
              },
              { track: null },
            ],
            next,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                track: {
                  id: "track-1",
                  artists: [
                    { id: "artist-2", name: "Artist Two" },
                    { id: "artist-3", name: "Artist Three" },
                  ],
                },
              },
              { track: { id: "track-2", artists: [{ id: "artist-4" }] } },
            ],
            next: null,
          }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const service = new SpotifyApiService(
      new ConfigService({ SPOTIFY_CLIENT_ID: "client", SPOTIFY_CLIENT_SECRET: "secret" })
    );

    await expect(service.getSavedTracks("access-token")).resolves.toEqual([
      {
        trackId: "track-1",
        artists: [
          { id: "artist-1", name: "Artist One" },
          { id: "artist-2", name: "Artist Two" },
          { id: "artist-3", name: "Artist Three" },
        ],
      },
      { trackId: "track-2", artists: [{ id: "artist-4", name: null }] },
    ]);

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(firstUrl.pathname).toBe("/v1/me/tracks");
    expect(firstUrl.searchParams.get("limit")).toBe("50");
    expect(fetchMock.mock.calls[1][0].toString()).toBe(next);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
