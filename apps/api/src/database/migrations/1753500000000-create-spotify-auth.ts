import { type MigrationInterface, type QueryRunner } from "typeorm";

export class CreateSpotifyAuth1753500000000 implements MigrationInterface {
  name = "CreateSpotifyAuth1753500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE SCHEMA IF NOT EXISTS spotify;

      CREATE TABLE IF NOT EXISTS public.users (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.sessions (
        sid varchar PRIMARY KEY,
        sess json NOT NULL,
        expire timestamp(6) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS sessions_expire_idx
        ON public.sessions (expire);

      CREATE TABLE IF NOT EXISTS spotify.accounts (
        user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
        spotify_user_id text NOT NULL UNIQUE,
        display_name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS spotify.credentials (
        user_id uuid PRIMARY KEY REFERENCES spotify.accounts(user_id) ON DELETE CASCADE,
        access_token text NOT NULL,
        refresh_token text NOT NULL,
        expires_at timestamptz NOT NULL,
        scopes text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS spotify.credentials;
      DROP TABLE IF EXISTS spotify.accounts;
      DROP TABLE IF EXISTS public.sessions;
      DROP TABLE IF EXISTS public.users;
      DROP SCHEMA IF EXISTS spotify;
    `);
  }
}
