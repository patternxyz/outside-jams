import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { type SpotifyProfile, type SpotifyTokens } from "./spotify.types.js";
import { SpotifyTokenService } from "./spotify-token.service.js";
import { TokenCipherService } from "./token-cipher.service.js";

@Injectable()
export class SpotifyIdentityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cipher: TokenCipherService,
    private readonly tokenService: SpotifyTokenService
  ) {}

  async provision(
    profile: SpotifyProfile,
    tokens: SpotifyTokens,
    sessionUserId?: string
  ): Promise<string> {
    const userId = await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", [profile.id]);

      const existing = (await manager.query(
        "SELECT user_id FROM spotify.accounts WHERE spotify_user_id = $1",
        [profile.id]
      )) as Array<{ user_id: string }>;
      const id = existing[0]?.user_id ?? sessionUserId ?? randomUUID();

      if (existing.length === 0) {
        await manager.query(
          "INSERT INTO public.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
          [id]
        );
        await manager.query(
          `INSERT INTO spotify.accounts (user_id, spotify_user_id, display_name)
           VALUES ($1, $2, $3)`,
          [id, profile.id, profile.displayName]
        );
      } else {
        await manager.query(
          "UPDATE spotify.accounts SET display_name = $2, updated_at = now() WHERE user_id = $1",
          [id, profile.displayName]
        );
        await manager.query("UPDATE public.users SET updated_at = now() WHERE id = $1", [id]);
      }

      await manager.query(
        `INSERT INTO spotify.credentials
           (user_id, access_token, refresh_token, expires_at, scopes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           expires_at = EXCLUDED.expires_at,
           scopes = EXCLUDED.scopes,
           updated_at = now()`,
        [
          id,
          this.cipher.encrypt(tokens.accessToken),
          this.cipher.encrypt(tokens.refreshToken),
          tokens.expiresAt,
          tokens.scopes,
        ]
      );

      return id;
    });

    this.tokenService.prime({ userId, ...tokens });
    return userId;
  }
}
