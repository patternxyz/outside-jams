import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { LRUCache } from "lru-cache";
import { Repository } from "typeorm";

import { SpotifyCredential } from "./entities/spotify-credential.entity.js";
import { SpotifyApiService } from "./spotify-api.service.js";
import { type CachedSpotifyTokens, type SpotifyTokens } from "./spotify.types.js";
import { TokenCipherService } from "./token-cipher.service.js";

const DEFAULT_CACHE_SIZE = 500;
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const REFRESH_SKEW_MS = 60_000;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class SpotifyTokenService {
  private readonly cache: LRUCache<string, CachedSpotifyTokens>;
  private readonly refreshes = new Map<string, Promise<CachedSpotifyTokens>>();

  constructor(
    @InjectRepository(SpotifyCredential)
    private readonly credentials: Repository<SpotifyCredential>,
    private readonly spotifyApi: SpotifyApiService,
    private readonly cipher: TokenCipherService,
    config: ConfigService
  ) {
    this.cache = new LRUCache({
      max: positiveInteger(config.get<string>("SPOTIFY_TOKEN_CACHE_SIZE"), DEFAULT_CACHE_SIZE),
      ttl: positiveInteger(config.get<string>("SPOTIFY_TOKEN_CACHE_TTL_MS"), DEFAULT_CACHE_TTL_MS),
    });
  }

  prime(tokens: CachedSpotifyTokens): void {
    this.cache.set(tokens.userId, tokens);
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const tokens = this.cache.get(userId) ?? (await this.load(userId));
    if (tokens.expiresAt.getTime() > Date.now() + REFRESH_SKEW_MS) {
      return tokens.accessToken;
    }
    return (await this.refreshOnce(tokens)).accessToken;
  }

  private async load(userId: string): Promise<CachedSpotifyTokens> {
    const credential = await this.credentials.findOneBy({ userId });
    if (!credential) {
      throw new UnauthorizedException("Spotify is not connected");
    }
    const tokens: CachedSpotifyTokens = {
      userId,
      accessToken: this.cipher.decrypt(credential.accessToken),
      refreshToken: this.cipher.decrypt(credential.refreshToken),
      expiresAt: credential.expiresAt,
      scopes: credential.scopes,
    };
    this.cache.set(userId, tokens);
    return tokens;
  }

  private refreshOnce(tokens: CachedSpotifyTokens): Promise<CachedSpotifyTokens> {
    const active = this.refreshes.get(tokens.userId);
    if (active) return active;

    const refresh = this.refreshAndPersist(tokens)
      .catch((error: unknown) => {
        this.cache.delete(tokens.userId);
        throw error;
      })
      .finally(() => this.refreshes.delete(tokens.userId));
    this.refreshes.set(tokens.userId, refresh);
    return refresh;
  }

  private async refreshAndPersist(tokens: CachedSpotifyTokens): Promise<CachedSpotifyTokens> {
    let refreshed: SpotifyTokens;
    try {
      refreshed = await this.spotifyApi.refresh(tokens.refreshToken);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.credentials.delete({ userId: tokens.userId });
      }
      throw error;
    }
    await this.writeThrough(tokens.userId, refreshed);
    const cached = { userId: tokens.userId, ...refreshed };
    this.cache.set(tokens.userId, cached);
    return cached;
  }

  private async writeThrough(userId: string, tokens: SpotifyTokens): Promise<void> {
    const result = await this.credentials.update(
      { userId },
      {
        accessToken: this.cipher.encrypt(tokens.accessToken),
        refreshToken: this.cipher.encrypt(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        updatedAt: new Date(),
      }
    );
    if (result.affected !== 1) {
      throw new UnauthorizedException("Spotify is not connected");
    }
  }
}
