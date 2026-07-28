import { type MigrationInterface, type QueryRunner } from "typeorm";

export class RefactorSpotifySchema1754100000000 implements MigrationInterface {
  name = "RefactorSpotifySchema1754100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS spotify.user_tags;
      DROP TABLE IF EXISTS spotify.tags;
      DROP TABLE IF EXISTS public.tags;
      DROP TABLE IF EXISTS spotify.followed_artists;
      DROP TABLE IF EXISTS spotify.top_artists;
      DROP TABLE IF EXISTS spotify.credentials;
      ALTER TABLE public.users DROP COLUMN IF EXISTS spotify_account_id;
      ALTER TABLE public.users DROP COLUMN IF EXISTS spotify_user_id;
      DROP TABLE IF EXISTS spotify.accounts;

      CREATE TABLE spotify.accounts (
        id text PRIMARY KEY,
        display_name text NOT NULL,
        last_sync_date timestamptz,
        last_sync_status text,
        last_update text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT accounts_last_sync_status_check
          CHECK (last_sync_status IN ('started', 'completed', 'failed'))
      );

      ALTER TABLE public.users
        ADD COLUMN spotify_account_id text UNIQUE
          REFERENCES spotify.accounts(id) ON DELETE SET NULL;

      CREATE TABLE spotify.credentials (
        account_id text PRIMARY KEY
          REFERENCES spotify.accounts(id) ON DELETE CASCADE,
        access_token text NOT NULL,
        refresh_token text NOT NULL,
        expires_at timestamptz NOT NULL,
        scopes text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE spotify.top_artists (
        artist_id text NOT NULL,
        account_id text NOT NULL
          REFERENCES spotify.accounts(id) ON DELETE CASCADE,
        PRIMARY KEY (account_id, artist_id)
      );

      CREATE INDEX top_artists_artist_id_idx
        ON spotify.top_artists (artist_id);

      CREATE TABLE spotify.followed_artists (
        artist_id text NOT NULL,
        account_id text NOT NULL
          REFERENCES spotify.accounts(id) ON DELETE CASCADE,
        PRIMARY KEY (account_id, artist_id)
      );

      CREATE INDEX followed_artists_artist_id_idx
        ON spotify.followed_artists (artist_id);

      CREATE TABLE public.tags (
        user_id uuid NOT NULL
          REFERENCES public.users(id) ON DELETE CASCADE,
        artist_id uuid NOT NULL
          REFERENCES public.artists(id) ON DELETE CASCADE,
        tags text[] NOT NULL,
        PRIMARY KEY (user_id, artist_id)
      );

      CREATE INDEX tags_user_id_idx
        ON public.tags (user_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS public.tags;
      DROP TABLE IF EXISTS spotify.tags;
      DROP TABLE IF EXISTS spotify.followed_artists;
      DROP TABLE IF EXISTS spotify.top_artists;
      DROP TABLE IF EXISTS spotify.credentials;
      ALTER TABLE public.users DROP COLUMN IF EXISTS spotify_account_id;
      DROP TABLE IF EXISTS spotify.accounts;

      CREATE TABLE spotify.accounts (
        user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
        spotify_user_id text NOT NULL UNIQUE,
        display_name text NOT NULL,
        last_sync_date timestamptz,
        last_sync_status text,
        last_update text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT accounts_last_sync_status_check
          CHECK (last_sync_status IN ('started', 'completed', 'failed'))
      );

      CREATE TABLE spotify.credentials (
        user_id uuid PRIMARY KEY REFERENCES spotify.accounts(user_id) ON DELETE CASCADE,
        access_token text NOT NULL,
        refresh_token text NOT NULL,
        expires_at timestamptz NOT NULL,
        scopes text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE spotify.top_artists (
        artist_id text NOT NULL,
        user_id uuid NOT NULL REFERENCES spotify.accounts(user_id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, artist_id)
      );

      CREATE INDEX top_artists_artist_id_idx
        ON spotify.top_artists (artist_id);

      CREATE TABLE spotify.followed_artists (
        artist_id text NOT NULL,
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        CONSTRAINT followed_artists_spotify_account_fkey
          FOREIGN KEY (user_id) REFERENCES spotify.accounts(user_id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, artist_id)
      );

      CREATE INDEX followed_artists_artist_id_idx
        ON spotify.followed_artists (artist_id);

      CREATE TABLE spotify.user_tags (
        user_id uuid NOT NULL REFERENCES spotify.accounts(user_id) ON DELETE CASCADE,
        artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
        tags text[] NOT NULL,
        PRIMARY KEY (user_id, artist_id)
      );

      CREATE INDEX user_tags_user_id_idx
        ON spotify.user_tags (user_id);
    `);
  }
}
