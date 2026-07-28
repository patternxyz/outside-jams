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
      {
        lastSyncDate: startedAt,
        lastSyncStatus: "started",
        lastUpdate: "Sync started",
        updatedAt: startedAt,
      }
    );
    if (!started.affected) throw new NotFoundException("Spotify account not found");

    let stage = "loading an access token";
    try {
      const accessToken = await this.tokenService.getValidAccessToken(userId);

      stage = "fetching top artists";
      const topArtistIds = await this.spotifyApi.getTopArtistIds(accessToken);
      await this.updateProgress(userId, `Fetched ${topArtistIds.length} top artists`);

      stage = "fetching followed artists";
      const followedArtistIds = await this.spotifyApi.getFollowedArtistIds(accessToken);
      await this.updateProgress(userId, `Fetched ${followedArtistIds.length} followed artists`);

      stage = "saving top artists";
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
          [userId, topArtistIds]
        );
        await this.updateProgress(userId, `Saved ${topArtistIds.length} top artists`);

        stage = "saving followed artists";
        await manager.query(
          `WITH removed AS (
             DELETE FROM spotify.followed_artists
             WHERE user_id = $1
           )
           INSERT INTO spotify.followed_artists (artist_id, user_id)
           SELECT DISTINCT followed_artist.artist_id, $1::uuid
           FROM unnest($2::text[]) AS followed_artist(artist_id)
           WHERE followed_artist.artist_id <> ''
          ON CONFLICT (user_id, artist_id) DO NOTHING`,
          [userId, followedArtistIds]
        );
        await this.updateProgress(userId, `Saved ${followedArtistIds.length} followed artists`);
      });

      stage = "completing sync";
      const completedAt = new Date();
      await this.accounts.update(
        { userId },
        {
          lastSyncDate: completedAt,
          lastSyncStatus: "completed",
          lastUpdate: "Sync completed",
          updatedAt: completedAt,
        }
      );
    } catch (error) {
      const failedAt = new Date();
      await this.accounts.update(
        { userId },
        {
          lastSyncDate: failedAt,
          lastSyncStatus: "failed",
          lastUpdate: `Sync failed while ${stage}`,
          updatedAt: failedAt,
        }
      );
      throw error;
    }
  }

  private async updateProgress(userId: string, lastUpdate: string): Promise<void> {
    const result = await this.accounts.update({ userId }, { lastUpdate, updatedAt: new Date() });
    if (!result.affected) throw new NotFoundException("Spotify account not found");
  }
}
