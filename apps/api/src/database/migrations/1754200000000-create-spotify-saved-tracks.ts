import { type MigrationInterface, type QueryRunner } from "typeorm";

export class CreateSpotifySavedTracks1754200000000 implements MigrationInterface {
  name = "CreateSpotifySavedTracks1754200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE spotify.saved (
        account_id text NOT NULL
          REFERENCES spotify.accounts(id) ON DELETE CASCADE,
        track_id text NOT NULL,
        PRIMARY KEY (account_id, track_id)
      );

      CREATE INDEX saved_track_id_idx
        ON spotify.saved (track_id);

      CREATE TABLE spotify.tracks (
        track_id text NOT NULL,
        artist_id text NOT NULL,
        PRIMARY KEY (track_id, artist_id)
      );

      CREATE INDEX tracks_artist_id_idx
        ON spotify.tracks (artist_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS spotify.saved;
      DROP TABLE IF EXISTS spotify.tracks;
    `);
  }
}
