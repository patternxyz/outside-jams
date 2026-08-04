import { type MigrationInterface, type QueryRunner } from "typeorm";

export class AddSpotifyArtistName1754300000000 implements MigrationInterface {
  name = "AddSpotifyArtistName1754300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE spotify.artists ADD COLUMN IF NOT EXISTS name text;

      UPDATE spotify.artists AS spotify_artist
      SET name = artist.name
      FROM public.artists AS artist
      WHERE artist.spotify_id = spotify_artist.id
        AND spotify_artist.name IS NULL
        AND NULLIF(btrim(artist.name), '') IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE spotify.artists DROP COLUMN IF EXISTS name");
  }
}
