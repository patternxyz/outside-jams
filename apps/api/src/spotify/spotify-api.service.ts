import { BadGatewayException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type SpotifyProfile, type SpotifyTokens } from "./spotify.types.js";

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

type SpotifyProfileResponse = {
  id: string;
  display_name: string | null;
};

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
    const response = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(`Spotify profile request failed (${response.status})`);
      }
      throw new BadGatewayException(`Spotify profile request failed (${response.status})`);
    }
    const profile = (await response.json()) as SpotifyProfileResponse;
    return { id: profile.id, displayName: profile.display_name?.trim() || "Spotify user" };
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
