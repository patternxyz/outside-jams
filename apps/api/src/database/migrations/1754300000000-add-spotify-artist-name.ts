import { type MigrationInterface, type QueryRunner } from "typeorm";

export class AddSpotifyArtistName1754300000000 implements MigrationInterface {
  name = "AddSpotifyArtistName1754300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spotify.artists (
        id text PRIMARY KEY,
        name text
      );

      ALTER TABLE spotify.artists ADD COLUMN IF NOT EXISTS name text;

      INSERT INTO spotify.artists (id)
      SELECT DISTINCT artist_id
      FROM spotify.tracks
      WHERE NULLIF(btrim(artist_id), '') IS NOT NULL
      ON CONFLICT (id) DO NOTHING;

      DO $$
      BEGIN
        IF to_regclass('public.artists') IS NOT NULL THEN
          EXECUTE $backfill$
            UPDATE spotify.artists AS spotify_artist
            SET name = artist.name
            FROM public.artists AS artist
            WHERE artist.spotify_id = spotify_artist.id
              AND spotify_artist.name IS NULL
              AND NULLIF(btrim(artist.name), '') IS NOT NULL
          $backfill$;
        END IF;
      END
      $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'spotify.tracks'::regclass
            AND conname = 'spotify_tracks_artist_id_fkey'
        ) THEN
          ALTER TABLE spotify.tracks
            ADD CONSTRAINT spotify_tracks_artist_id_fkey
            FOREIGN KEY (artist_id) REFERENCES spotify.artists(id);
        END IF;
      END
      $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE spotify.tracks
        DROP CONSTRAINT IF EXISTS spotify_tracks_artist_id_fkey;
      ALTER TABLE spotify.artists DROP COLUMN IF EXISTS name;
    `);
  }
}
