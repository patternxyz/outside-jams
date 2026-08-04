import { BadGatewayException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  type SpotifyArtist,
  type SpotifyProfile,
  type SpotifySavedTrack,
  type SpotifyTokens,
} from "./spotify.types.js";

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

type SpotifyProfileResponse = {
  id: string;
  display_name: string | null;
  images: Array<{ url: string }>;
};

type SpotifyArtistsPage = {
  items: Array<{ id: string; name?: unknown }>;
  next: string | null;
};

type SpotifyFollowedArtistsResponse = {
  artists: SpotifyArtistsPage;
};

type SpotifySavedTracksPage = {
  items: Array<{
    track: {
      id: string;
      artists: Array<{ id: string; name?: unknown }>;
    } | null;
  }>;
  next: string | null;
};

const SPOTIFY_API_ORIGIN = "https://api.spotify.com";
const TOP_ARTISTS_PATH = "/v1/me/top/artists";
const FOLLOWED_ARTISTS_PATH = "/v1/me/following";
const SAVED_TRACKS_PATH = "/v1/me/tracks";
const DEFAULT_RETRY_AFTER_SECONDS = 1;
const MAX_RATE_LIMIT_RETRIES = 3;

@Injectable()
export class SpotifyApiService {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(config: ConfigService) {
    this.clientId = config.getOrThrow<string>("SPOTIFY_CLIENT_ID");
    this.clientSecret = config.getOrThrow<string>("SPOTIFY_CLIENT_SECRET");
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<SpotifyTokens> {
    const response = await this.requestToken(
      new URLSearchParams({
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      })
    );

    if (!response.refresh_token) {
      throw new UnauthorizedException("Spotify did not issue a refresh token");
    }
    return this.toTokens(response, response.refresh_token);
  }

  async refresh(refreshToken: string): Promise<SpotifyTokens> {
    const response = await this.requestToken(
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
    );
    return this.toTokens(response, response.refresh_token ?? refreshToken);
  }

  async getProfile(accessToken: string): Promise<SpotifyProfile> {
    const response = await fetch(`${SPOTIFY_API_ORIGIN}/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(`Spotify profile request failed (${response.status})`);
      }
      throw new BadGatewayException(`Spotify profile request failed (${response.status})`);
    }
    const profile = (await response.json()) as SpotifyProfileResponse;
    const image = Array.isArray(profile.images)
      ? profile.images.find((candidate) => typeof candidate?.url === "string" && candidate.url)?.url
      : undefined;
    return {
      id: profile.id,
      displayName: profile.display_name?.trim() || "Spotify user",
      image: image ?? null,
    };
  }

  async getTopArtists(accessToken: string): Promise<SpotifyArtist[]> {
    const firstPage = new URL(TOP_ARTISTS_PATH, SPOTIFY_API_ORIGIN);
    firstPage.search = new URLSearchParams({ limit: "50", time_range: "long_term" }).toString();

    const artists = new Map<string, SpotifyArtist>();
    const visited = new Set<string>();
    let next: string | null = firstPage.toString();

    while (next !== null) {
      let url: URL;
      try {
        url = new URL(next);
      } catch {
        throw new BadGatewayException("Spotify returned an invalid top artists page URL");
      }
      if (url.origin !== SPOTIFY_API_ORIGIN || url.pathname !== TOP_ARTISTS_PATH) {
        throw new BadGatewayException("Spotify returned an invalid top artists page URL");
      }
      if (visited.has(url.toString())) {
        throw new BadGatewayException("Spotify returned a repeated top artists page URL");
      }
      visited.add(url.toString());

      const response = await this.requestPage(url, accessToken);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new UnauthorizedException(
            `Spotify top artists request failed (${response.status})`
          );
        }
        throw new BadGatewayException(`Spotify top artists request failed (${response.status})`);
      }

      const page = (await response.json()) as Partial<SpotifyArtistsPage>;
      if (!Array.isArray(page.items) || (page.next !== null && typeof page.next !== "string")) {
        throw new BadGatewayException("Spotify returned an invalid top artists response");
      }
      for (const artist of page.items) {
        this.addArtist(artists, artist);
      }
      next = page.next;
    }

    return [...artists.values()];
  }

  async getFollowedArtists(accessToken: string): Promise<SpotifyArtist[]> {
    const firstPage = new URL(FOLLOWED_ARTISTS_PATH, SPOTIFY_API_ORIGIN);
    firstPage.search = new URLSearchParams({ limit: "50", type: "artist" }).toString();

    const artists = new Map<string, SpotifyArtist>();
    const visited = new Set<string>();
    let next: string | null = firstPage.toString();

    while (next !== null) {
      let url: URL;
      try {
        url = new URL(next);
      } catch {
        throw new BadGatewayException("Spotify returned an invalid followed artists page URL");
      }
      if (url.origin !== SPOTIFY_API_ORIGIN || url.pathname !== FOLLOWED_ARTISTS_PATH) {
        throw new BadGatewayException("Spotify returned an invalid followed artists page URL");
      }
      if (visited.has(url.toString())) {
        throw new BadGatewayException("Spotify returned a repeated followed artists page URL");
      }
      visited.add(url.toString());

      const response = await this.requestPage(url, accessToken);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new UnauthorizedException(
            `Spotify followed artists request failed (${response.status})`
          );
        }
        throw new BadGatewayException(
          `Spotify followed artists request failed (${response.status})`
        );
      }

      const body = (await response.json()) as Partial<SpotifyFollowedArtistsResponse>;
      const page = body.artists;
      if (
        !page ||
        !Array.isArray(page.items) ||
        (page.next !== null && typeof page.next !== "string")
      ) {
        throw new BadGatewayException("Spotify returned an invalid followed artists response");
      }
      for (const artist of page.items) {
        this.addArtist(artists, artist);
      }
      next = page.next;
    }

    return [...artists.values()];
  }

  async getSavedTracks(accessToken: string): Promise<SpotifySavedTrack[]> {
    const firstPage = new URL(SAVED_TRACKS_PATH, SPOTIFY_API_ORIGIN);
    firstPage.search = new URLSearchParams({ limit: "50" }).toString();

    const tracks = new Map<string, Map<string, SpotifyArtist>>();
    const visited = new Set<string>();
    let next: string | null = firstPage.toString();

    while (next !== null) {
      let url: URL;
      try {
        url = new URL(next);
      } catch {
        throw new BadGatewayException("Spotify returned an invalid saved tracks page URL");
      }
      if (url.origin !== SPOTIFY_API_ORIGIN || url.pathname !== SAVED_TRACKS_PATH) {
        throw new BadGatewayException("Spotify returned an invalid saved tracks page URL");
      }
      if (visited.has(url.toString())) {
        throw new BadGatewayException("Spotify returned a repeated saved tracks page URL");
      }
      visited.add(url.toString());

      const response = await this.requestPage(url, accessToken);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new UnauthorizedException(
            `Spotify saved tracks request failed (${response.status})`
          );
        }
        throw new BadGatewayException(`Spotify saved tracks request failed (${response.status})`);
      }

      const page = (await response.json()) as Partial<SpotifySavedTracksPage>;
      if (!Array.isArray(page.items) || (page.next !== null && typeof page.next !== "string")) {
        throw new BadGatewayException("Spotify returned an invalid saved tracks response");
      }
      for (const item of page.items) {
        const track = item?.track;
        if (!track || typeof track.id !== "string" || !track.id || !Array.isArray(track.artists)) {
          continue;
        }
        const artists = tracks.get(track.id) ?? new Map<string, SpotifyArtist>();
        for (const artist of track.artists) {
          this.addArtist(artists, artist);
        }
        tracks.set(track.id, artists);
      }
      next = page.next;
    }

    return [...tracks].map(([trackId, artists]) => ({
      trackId,
      artists: [...artists.values()],
    }));
  }

  private addArtist(
    artists: Map<string, SpotifyArtist>,
    candidate: { id?: unknown; name?: unknown } | null | undefined
  ): void {
    if (typeof candidate?.id !== "string" || !candidate.id) return;

    const name = typeof candidate.name === "string" ? candidate.name.trim() || null : null;
    const existing = artists.get(candidate.id);
    if (!existing || (!existing.name && name))
      artists.set(candidate.id, { id: candidate.id, name });
  }

  private async requestPage(url: URL, accessToken: string): Promise<Response> {
    for (let retry = 0; ; retry += 1) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status !== 429 || retry >= MAX_RATE_LIMIT_RETRIES) return response;

      const retryAfter = Number(response.headers.get("retry-after"));
      const retryAfterSeconds =
        Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : DEFAULT_RETRY_AFTER_SECONDS;
      await new Promise<void>((resolve) => setTimeout(resolve, retryAfterSeconds * 1_000));
    }
  }

  private async requestToken(body: URLSearchParams): Promise<SpotifyTokenResponse> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        throw new UnauthorizedException(`Spotify token request failed (${response.status})`);
      }
      throw new BadGatewayException(`Spotify token request failed (${response.status})`);
    }
    return (await response.json()) as SpotifyTokenResponse;
  }

  private toTokens(response: SpotifyTokenResponse, refreshToken: string): SpotifyTokens {
    return {
      accessToken: response.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + response.expires_in * 1_000),
      scopes: response.scope?.split(" ").filter(Boolean) ?? [],
    };
  }
}
