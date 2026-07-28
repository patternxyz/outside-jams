import { type MigrationInterface, type QueryRunner } from "typeorm";

export class CreateSpotifyTopArtists1753700000000 implements MigrationInterface {
  name = "CreateSpotifyTopArtists1753700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spotify.top_artists (
        artist_id text NOT NULL,
        user_id uuid NOT NULL REFERENCES spotify.accounts(user_id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, artist_id)
      );

      CREATE INDEX IF NOT EXISTS top_artists_artist_id_idx
        ON spotify.top_artists (artist_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS spotify.top_artists");
  }
}
