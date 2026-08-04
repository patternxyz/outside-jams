import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { User } from "../users/entities/user.entity.js";
import { SpotifyAccount } from "./entities/spotify-account.entity.js";
import { SpotifyApiService } from "./spotify-api.service.js";
import { SpotifyTokenService } from "./spotify-token.service.js";

@Injectable()
export class SpotifySyncService {
  constructor(
    @InjectRepository(SpotifyAccount)
    private readonly accounts: Repository<SpotifyAccount>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly spotifyApi: SpotifyApiService,
    private readonly tokenService: SpotifyTokenService
  ) {}

  async sync(userId: string): Promise<void> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user?.spotifyAccountId) throw new NotFoundException("Spotify account not found");

    const account = await this.accounts.findOneBy({ id: user.spotifyAccountId });
    if (!account) throw new NotFoundException("Spotify account not found");

    const accountId = account.id;
    const startedAt = new Date();
    const started = await this.accounts.update(
      { id: accountId },
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
      const topArtists = await this.spotifyApi.getTopArtists(accessToken);
      await this.updateProgress(accountId, `Fetched ${topArtists.length} top artists`);

      stage = "fetching followed artists";
      const followedArtists = await this.spotifyApi.getFollowedArtists(accessToken);
      await this.updateProgress(accountId, `Fetched ${followedArtists.length} followed artists`);

      stage = "fetching saved tracks";
      const savedTracks = await this.spotifyApi.getSavedTracks(accessToken);
      await this.updateProgress(accountId, `Fetched ${savedTracks.length} saved tracks`);

      const savedTrackIds = savedTracks.map(({ trackId }) => trackId);
      const trackArtistPairs = savedTracks.flatMap(({ trackId, artists }) =>
        artists.map(({ id: artistId }) => ({ trackId, artistId }))
      );
      const artistsById = new Map<string, { id: string; name: string | null }>();
      for (const artist of [
        ...topArtists,
        ...followedArtists,
        ...savedTracks.flatMap(({ artists }) => artists),
      ]) {
        const existing = artistsById.get(artist.id);
        if (!existing || (!existing.name && artist.name)) artistsById.set(artist.id, artist);
      }
      const artists = [...artistsById.values()];
      const topArtistIds = topArtists.map(({ id }) => id);
      const followedArtistIds = followedArtists.map(({ id }) => id);

      stage = "saving top artists";
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO spotify.artists (id, name)
           SELECT artist.id, artist.name
           FROM unnest($1::text[], $2::text[]) AS artist(id, name)
           WHERE artist.id <> ''
           ON CONFLICT (id) DO UPDATE SET
             name = COALESCE(EXCLUDED.name, spotify.artists.name)`,
          [artists.map(({ id }) => id), artists.map(({ name }) => name)]
        );
        await manager.query(
          `WITH removed AS (
             DELETE FROM spotify.top_artists
             WHERE account_id = $1
           )
           INSERT INTO spotify.top_artists (artist_id, account_id)
           SELECT DISTINCT top_artist.artist_id, $1::text
           FROM unnest($2::text[]) AS top_artist(artist_id)
           WHERE top_artist.artist_id <> ''
          ON CONFLICT (account_id, artist_id) DO NOTHING`,
          [accountId, topArtistIds]
        );
        await this.updateProgress(accountId, `Saved ${topArtists.length} top artists`);

        stage = "saving followed artists";
        await manager.query(
          `WITH removed AS (
             DELETE FROM spotify.followed_artists
             WHERE account_id = $1
           )
           INSERT INTO spotify.followed_artists (artist_id, account_id)
           SELECT DISTINCT followed_artist.artist_id, $1::text
           FROM unnest($2::text[]) AS followed_artist(artist_id)
           WHERE followed_artist.artist_id <> ''
          ON CONFLICT (account_id, artist_id) DO NOTHING`,
          [accountId, followedArtistIds]
        );
        await this.updateProgress(accountId, `Saved ${followedArtists.length} followed artists`);

        stage = "saving saved tracks";
        await manager.query(
          `INSERT INTO spotify.tracks (track_id, artist_id)
           SELECT DISTINCT track.track_id, track.artist_id
           FROM unnest($1::text[], $2::text[]) AS track(track_id, artist_id)
           WHERE track.track_id <> '' AND track.artist_id <> ''
           ON CONFLICT (track_id, artist_id) DO NOTHING`,
          [
            trackArtistPairs.map(({ trackId }) => trackId),
            trackArtistPairs.map(({ artistId }) => artistId),
          ]
        );
        await manager.query(
          `WITH removed AS (
             DELETE FROM spotify.saved
             WHERE account_id = $1
           )
           INSERT INTO spotify.saved (account_id, track_id)
           SELECT $1::text, saved_track.track_id
           FROM unnest($2::text[]) AS saved_track(track_id)
           WHERE saved_track.track_id <> ''
           ON CONFLICT (account_id, track_id) DO NOTHING`,
          [accountId, savedTrackIds]
        );
        await this.updateProgress(accountId, `Saved ${savedTracks.length} saved tracks`);

        stage = "projecting artist tags";
        await manager.query("DELETE FROM public.tags WHERE user_id = $1", [userId]);
        await manager.query(
          `INSERT INTO public.tags (user_id, artist_id, tags)
           SELECT user_id, artist_id, array_agg(DISTINCT tag ORDER BY tag)
           FROM (
             SELECT $1::uuid AS user_id, artist.id AS artist_id, 'following'::text AS tag
             FROM spotify.followed_artists AS fa
             JOIN public.artists AS artist
               ON artist.spotify_id = fa.artist_id
             WHERE fa.account_id = $2

             UNION ALL

             SELECT $1::uuid AS user_id, artist.id AS artist_id, 'top'::text AS tag
             FROM spotify.top_artists AS ta
             JOIN public.artists AS artist
               ON artist.spotify_id = ta.artist_id
             WHERE ta.account_id = $2

             UNION ALL

             SELECT $1::uuid AS user_id, artist.id AS artist_id, 'saved'::text AS tag
             FROM spotify.saved AS saved
             JOIN spotify.tracks AS track
               ON track.track_id = saved.track_id
             JOIN public.artists AS artist
               ON artist.spotify_id = track.artist_id
             WHERE saved.account_id = $2
           ) AS artist_tags
           GROUP BY user_id, artist_id`,
          [userId, accountId]
        );
        await this.updateProgress(accountId, "Projected artist tags");
      });

      stage = "completing sync";
      const completedAt = new Date();
      await this.accounts.update(
        { id: accountId },
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
        { id: accountId },
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

  private async updateProgress(accountId: string, lastUpdate: string): Promise<void> {
    const result = await this.accounts.update(
      { id: accountId },
      { lastUpdate, updatedAt: new Date() }
    );
    if (!result.affected) throw new NotFoundException("Spotify account not found");
  }
}
