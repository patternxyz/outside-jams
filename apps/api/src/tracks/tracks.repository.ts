import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { TrackResponseDto } from "./dto/track-response.dto.js";

@Injectable()
export class TracksRepository {
  constructor(private readonly dataSource: DataSource) {}

  findByPublicArtistId(artistId: string): Promise<TrackResponseDto[]> {
    return this.dataSource.query<TrackResponseDto[]>(
      `SELECT
         artist.id AS "artistId",
         track.album_id AS "albumId",
         track.name,
         track.duration,
         track.preview_url AS "previewUrl",
         track.id AS uri
       FROM public.artists AS artist
       JOIN spotify.tracks AS track
         ON track.artist_id = artist.spotify_id
       WHERE artist.id = $1
         AND track.id IS NOT NULL
         AND track.album_id IS NOT NULL
         AND track.name IS NOT NULL
         AND track.duration IS NOT NULL
       ORDER BY track.album_id, track.id`,
      [artistId]
    );
  }
}
