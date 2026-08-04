import { type MigrationInterface, type QueryRunner } from "typeorm";

export class ConvertPerformancesToScd21754400000000 implements MigrationInterface {
  name = "ConvertPerformancesToScd21754400000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      ALTER TABLE public.performances
        ADD COLUMN IF NOT EXISTS event_key text,
        ADD COLUMN IF NOT EXISTS performance_key uuid,
        ADD COLUMN IF NOT EXISTS valid_from timestamptz,
        ADD COLUMN IF NOT EXISTS valid_to timestamptz;

      UPDATE public.performances
      SET event_key = 'outside-lands-2026'
      WHERE event_key IS NULL;

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'performances'
            AND column_name = 'deleted_at'
        ) THEN
          UPDATE public.performances
          SET valid_from = COALESCE(valid_from, deleted_at),
              valid_to = COALESCE(valid_to, deleted_at)
          WHERE deleted_at IS NOT NULL;
        END IF;
      END
      $$;

      UPDATE public.performances
      SET performance_key = COALESCE(
            performance_key,
            uuid_generate_v5(
              '7c121c77-625b-49e7-b84c-c54628f61bd2'::uuid,
              'performance:' || event_key || ':' || artist_id::text
            )
          ),
          valid_from = COALESCE(valid_from, now())
      WHERE performance_key IS NULL OR valid_from IS NULL;

      ALTER TABLE public.performances
        ALTER COLUMN event_key SET NOT NULL,
        ALTER COLUMN performance_key SET NOT NULL,
        ALTER COLUMN valid_from SET NOT NULL;

      ALTER TABLE public.performances
        DROP CONSTRAINT IF EXISTS performances_artist_date_times_key;

      DROP INDEX IF EXISTS public.performances_event_key_deleted_at_idx;
      ALTER TABLE public.performances DROP COLUMN IF EXISTS deleted_at;

      CREATE INDEX IF NOT EXISTS performances_current_key_idx
        ON public.performances (performance_key, valid_to);
      CREATE INDEX IF NOT EXISTS performances_event_key_valid_to_idx
        ON public.performances (event_key, valid_to);

      DROP VIEW IF EXISTS public.performance_changes;
      CREATE VIEW public.performance_changes AS
      WITH current_versions AS (
        SELECT *
        FROM public.performances
        WHERE valid_to IS NULL
      ),
      previous_versions AS (
        SELECT DISTINCT ON (performance_key) *
        FROM public.performances
        WHERE valid_to IS NOT NULL
        ORDER BY performance_key, valid_to DESC, valid_from DESC, id DESC
      )
      SELECT
        COALESCE(current.id, previous.id) AS id,
        COALESCE(current.performance_key, previous.performance_key) AS performance_key,
        COALESCE(current.event_key, previous.event_key) AS event_key,
        COALESCE(current.artist_id, previous.artist_id) AS artist_id,
        artist.name AS artist_name,
        COALESCE(current.date_only, previous.date_only) AS date_only,
        COALESCE(current.starts, previous.starts) AS starts,
        COALESCE(current.ends, previous.ends) AS ends,
        COALESCE(current.location, previous.location) AS location,
        CASE
          WHEN current.id IS NULL THEN 'removed'
          WHEN previous.id IS NULL THEN 'added'
          ELSE 'changed'
        END AS change_type,
        previous.id AS previous_performance_id,
        current.id AS current_performance_id,
        previous.date_only AS previous_date,
        current.date_only AS current_date,
        previous.starts AS previous_starts,
        current.starts AS current_starts,
        previous.ends AS previous_ends,
        current.ends AS current_ends,
        previous.location AS previous_location,
        current.location AS current_location,
        CASE
          WHEN previous.id IS NOT NULL AND current.id IS NOT NULL THEN
            array_remove(ARRAY[
              CASE WHEN previous.date_only IS DISTINCT FROM current.date_only THEN 'date' END,
              CASE WHEN previous.starts IS DISTINCT FROM current.starts THEN 'starts' END,
              CASE WHEN previous.ends IS DISTINCT FROM current.ends THEN 'ends' END,
              CASE WHEN previous.location IS DISTINCT FROM current.location THEN 'location' END
            ], NULL)
          ELSE ARRAY[]::text[]
        END AS changed_fields,
        previous.valid_from AS previous_valid_from,
        previous.valid_to AS previous_valid_to,
        current.valid_from AS current_valid_from,
        COALESCE(current.valid_from, previous.valid_to) AS detected_at
      FROM current_versions AS current
      FULL OUTER JOIN previous_versions AS previous
        ON previous.performance_key = current.performance_key
      JOIN public.artists AS artist
        ON artist.id = COALESCE(current.artist_id, previous.artist_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP VIEW IF EXISTS public.performance_changes;
      DROP INDEX IF EXISTS public.performances_event_key_valid_to_idx;
      DROP INDEX IF EXISTS public.performances_current_key_idx;

      WITH ranked_versions AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY performance_key
            ORDER BY (valid_to IS NULL) DESC, COALESCE(valid_to, valid_from) DESC, id DESC
          ) AS version_rank
        FROM public.performances
      )
      DELETE FROM public.performances AS performance
      USING ranked_versions AS ranked
      WHERE ranked.id = performance.id
        AND ranked.version_rank > 1;

      ALTER TABLE public.performances DROP COLUMN valid_to;
      ALTER TABLE public.performances DROP COLUMN valid_from;
      ALTER TABLE public.performances DROP COLUMN performance_key;
      ALTER TABLE public.performances DROP COLUMN event_key;

      ALTER TABLE public.performances
        ADD CONSTRAINT performances_artist_date_times_key
        UNIQUE NULLS NOT DISTINCT (artist_id, date_only, starts, ends);
    `);
  }
}
