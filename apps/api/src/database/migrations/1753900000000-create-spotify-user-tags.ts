import { type MigrationInterface, type QueryRunner } from "typeorm";

export class CreateSpotifyUserTags1753900000000 implements MigrationInterface {
  name = "CreateSpotifyUserTags1753900000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS spotify.user_tags (
        user_id uuid NOT NULL REFERENCES spotify.accounts(user_id) ON DELETE CASCADE,
        artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
        tags text[] NOT NULL,
        PRIMARY KEY (user_id, artist_id)
      );

      CREATE INDEX IF NOT EXISTS user_tags_user_id_idx
        ON spotify.user_tags (user_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS spotify.user_tags");
  }
}
