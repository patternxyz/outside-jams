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
        "SELECT id FROM public.users WHERE spotify_account_id = $1",
        [profile.id]
      )) as Array<{ id: string }>;
      const userId = existing[0]?.id ?? sessionUserId ?? randomUUID();

      await manager.query(
        `INSERT INTO spotify.accounts (id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           updated_at = now()`,
        [profile.id, profile.displayName]
      );
      await manager.query(
        `INSERT INTO public.users (id, spotify_account_id)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET
           spotify_account_id = EXCLUDED.spotify_account_id,
           updated_at = now()`,
        [userId, profile.id]
      );

      await manager.query(
        `INSERT INTO spotify.credentials
           (account_id, access_token, refresh_token, expires_at, scopes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id) DO UPDATE SET
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           expires_at = EXCLUDED.expires_at,
           scopes = EXCLUDED.scopes,
           updated_at = now()`,
        [
          profile.id,
          this.cipher.encrypt(tokens.accessToken),
          this.cipher.encrypt(tokens.refreshToken),
          tokens.expiresAt,
          tokens.scopes,
        ]
      );

      return userId;
    });

    this.tokenService.prime({ userId, accountId: profile.id, ...tokens });
    return userId;
  }

  async disconnect(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const users = (await manager.query(
        "SELECT spotify_account_id FROM public.users WHERE id = $1",
        [userId]
      )) as Array<{ spotify_account_id: string | null }>;
      const accountId = users[0]?.spotify_account_id;
      if (!accountId) return;

      await manager.query("DELETE FROM spotify.credentials WHERE account_id = $1", [accountId]);
      await manager.query("DELETE FROM spotify.top_artists WHERE account_id = $1", [accountId]);
      await manager.query("DELETE FROM spotify.followed_artists WHERE account_id = $1", [
        accountId,
      ]);
    });

    this.tokenService.invalidate(userId);
  }
}
