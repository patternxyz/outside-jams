import { type MigrationInterface, type QueryRunner } from "typeorm";

export class CreateSpotifyFollowedArtists1753800000000 implements MigrationInterface {
  name = "CreateSpotifyFollowedArtists1753800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spotify.followed_artists (
        artist_id text NOT NULL,
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        CONSTRAINT followed_artists_spotify_account_fkey
          FOREIGN KEY (user_id) REFERENCES spotify.accounts(user_id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, artist_id)
      );

      CREATE INDEX IF NOT EXISTS followed_artists_artist_id_idx
        ON spotify.followed_artists (artist_id);

      ALTER TABLE spotify.accounts
        ADD COLUMN IF NOT EXISTS last_update text;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE spotify.accounts
        DROP COLUMN IF EXISTS last_update;

      DROP TABLE IF EXISTS spotify.followed_artists;
    `);
  }
}
