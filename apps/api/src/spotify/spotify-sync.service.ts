import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { SpotifyAccount } from "./entities/spotify-account.entity.js";
import { SpotifyApiService } from "./spotify-api.service.js";
import { SpotifyTokenService } from "./spotify-token.service.js";

@Injectable()
export class SpotifySyncService {
  constructor(
    @InjectRepository(SpotifyAccount)
    private readonly accounts: Repository<SpotifyAccount>,
    private readonly dataSource: DataSource,
    private readonly spotifyApi: SpotifyApiService,
    private readonly tokenService: SpotifyTokenService
  ) {}

  async sync(userId: string): Promise<void> {
    const startedAt = new Date();
    const started = await this.accounts.update(
      { userId },
      { lastSyncDate: startedAt, lastSyncStatus: "started" }
    );
    if (!started.affected) throw new NotFoundException("Spotify account not found");

    try {
      const accessToken = await this.tokenService.getValidAccessToken(userId);
      const spotifyArtistIds = await this.spotifyApi.getTopArtistIds(accessToken);

      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `WITH removed AS (
             DELETE FROM spotify.top_artists
             WHERE user_id = $1
           )
           INSERT INTO spotify.top_artists (artist_id, user_id)
           SELECT DISTINCT top_artist.artist_id, $1::uuid
           FROM unnest($2::text[]) AS top_artist(artist_id)
           WHERE top_artist.artist_id <> ''
           ON CONFLICT (user_id, artist_id) DO NOTHING`,
          [userId, spotifyArtistIds]
        );
        await manager.update(
          SpotifyAccount,
          { userId },
          { lastSyncDate: new Date(), lastSyncStatus: "completed" }
        );
      });
    } catch (error) {
      await this.accounts.update(
        { userId },
        { lastSyncDate: new Date(), lastSyncStatus: "failed" }
      );
      throw error;
    }
  }
}
