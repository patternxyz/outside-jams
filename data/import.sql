-- PostgreSQL 15+ / psql
-- Run from the repository root:
--   psql "$DATABASE_URL" -f data/import.sql
--
-- The source is JSON Lines: one complete artist document per line. \copy loads
-- each document directly into a jsonb staging row.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS artists (
    id uuid NOT NULL,
    name text NOT NULL,
    spotify_id text,
    spotify_url text,
    instagram_url text,
    youtube_url text,
    CONSTRAINT artists_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS performances (
    id uuid NOT NULL,
    artist_id uuid NOT NULL,
    date_only date NOT NULL,
    starts timestamptz NULL,
    ends timestamptz NULL,
    location text NULL,
    CONSTRAINT performances_pkey PRIMARY KEY (id),
    CONSTRAINT performances_artist_id_fkey
        FOREIGN KEY (artist_id) REFERENCES artists (id),
    CONSTRAINT performances_artist_date_times_key
        UNIQUE NULLS NOT DISTINCT (artist_id, date_only, starts, ends)
);

-- Keep existing installations compatible when this script is re-run after the
-- location field was added.
ALTER TABLE performances ADD COLUMN IF NOT EXISTS location text;

-- artist_id is already the leading column of the unique constraint above.
CREATE INDEX IF NOT EXISTS performances_date_only_idx
    ON performances (date_only);
CREATE INDEX IF NOT EXISTS performances_starts_idx
    ON performances (starts);
CREATE INDEX IF NOT EXISTS performances_location_idx
    ON performances (location);

CREATE SCHEMA IF NOT EXISTS import_staging;

-- Clear debris from an interrupted process before opening the import
-- transaction. Once created below, this table is transaction-scoped: an error
-- rolls its creation back, while a successful run explicitly drops it.
DROP TABLE IF EXISTS import_staging.outside_lands_json;

BEGIN;

CREATE UNLOGGED TABLE import_staging.outside_lands_json (
    import_order bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payload jsonb NOT NULL
);

-- Delimiter and quote are control characters that cannot occur literally in
-- valid JSON strings, so COPY preserves JSON escape sequences verbatim.
\copy import_staging.outside_lands_json (payload) FROM 'data/outside_lands_2026.jsonl' WITH (FORMAT csv, DELIMITER E'\x01', QUOTE E'\x02')

WITH staged_artists AS (
    SELECT payload AS artist
    FROM import_staging.outside_lands_json
),
normalized_artists AS (
    SELECT
        uuid_generate_v5(
            '7c121c77-625b-49e7-b84c-c54628f61bd2'::uuid,
            CASE
                WHEN NULLIF(btrim(artist ->> 'spotifyId'), '') IS NOT NULL
                    THEN 'artist:spotify:' || btrim(artist ->> 'spotifyId')
                ELSE 'artist:name:' || lower(btrim(artist ->> 'name'))
            END
        ) AS id,
        btrim(artist ->> 'name') AS name,
        NULLIF(btrim(artist ->> 'spotifyId'), '') AS spotify_id,
        (
            SELECT link ->> 'url'
            FROM jsonb_array_elements(COALESCE(artist -> 'links', '[]'::jsonb)) AS links (link)
            WHERE lower(link ->> 'domain') = 'open.spotify.com'
            ORDER BY link ->> 'url'
            LIMIT 1
        ) AS spotify_url,
        (
            SELECT link ->> 'url'
            FROM jsonb_array_elements(COALESCE(artist -> 'links', '[]'::jsonb)) AS links (link)
            WHERE lower(link ->> 'domain') = 'instagram.com'
            ORDER BY link ->> 'url'
            LIMIT 1
        ) AS instagram_url,
        (
            SELECT link ->> 'url'
            FROM jsonb_array_elements(COALESCE(artist -> 'links', '[]'::jsonb)) AS links (link)
            WHERE lower(link ->> 'domain') = 'youtube.com'
            ORDER BY link ->> 'url'
            LIMIT 1
        ) AS youtube_url
    FROM staged_artists
),
deduplicated_artists AS (
    SELECT DISTINCT ON (id)
        id,
        name,
        spotify_id,
        spotify_url,
        instagram_url,
        youtube_url
    FROM normalized_artists
    ORDER BY id, name, spotify_url, instagram_url, youtube_url
)
INSERT INTO artists (
    id,
    name,
    spotify_id,
    spotify_url,
    instagram_url,
    youtube_url
)
SELECT
    id,
    name,
    spotify_id,
    spotify_url,
    instagram_url,
    youtube_url
FROM deduplicated_artists
WHERE true
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    spotify_id = EXCLUDED.spotify_id,
    spotify_url = EXCLUDED.spotify_url,
    instagram_url = EXCLUDED.instagram_url,
    youtube_url = EXCLUDED.youtube_url;

WITH staged_artists AS (
    SELECT payload AS artist
    FROM import_staging.outside_lands_json
),
staged_performances AS (
    SELECT
        uuid_generate_v5(
            '7c121c77-625b-49e7-b84c-c54628f61bd2'::uuid,
            CASE
                WHEN NULLIF(btrim(artist ->> 'spotifyId'), '') IS NOT NULL
                    THEN 'artist:spotify:' || btrim(artist ->> 'spotifyId')
                ELSE 'artist:name:' || lower(btrim(artist ->> 'name'))
            END
        ) AS artist_id,
        (performance ->> 'date')::date AS date_only,
        NULLIF(btrim(performance ->> 'startTime'), '')::timestamptz AS starts,
        NULLIF(btrim(performance ->> 'endTime'), '')::timestamptz AS ends,
        NULLIF(btrim(performance ->> 'location'), '') AS location
    FROM staged_artists
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(artist -> 'performances', '[]'::jsonb)
    ) AS performances (performance)
),
identified_performances AS (
    SELECT
        uuid_generate_v5(
            '7c121c77-625b-49e7-b84c-c54628f61bd2'::uuid,
            concat_ws(
                ':',
                'performance',
                artist_id::text,
                date_only::text,
                COALESCE(
                    to_char(
                        starts AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US'
                    ),
                    'null'
                ),
                COALESCE(
                    to_char(
                        ends AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US'
                    ),
                    'null'
                )
            )
        ) AS id,
        artist_id,
        date_only,
        starts,
        ends,
        location
    FROM staged_performances
),
deduplicated_performances AS (
    SELECT DISTINCT ON (id)
        id,
        artist_id,
        date_only,
        starts,
        ends,
        location
    FROM identified_performances
    ORDER BY id
)
INSERT INTO performances (id, artist_id, date_only, starts, ends, location)
SELECT id, artist_id, date_only, starts, ends, location
FROM deduplicated_performances
WHERE true
ON CONFLICT (id) DO UPDATE SET
    artist_id = EXCLUDED.artist_id,
    date_only = EXCLUDED.date_only,
    starts = EXCLUDED.starts,
    ends = EXCLUDED.ends,
    location = EXCLUDED.location;

DROP TABLE import_staging.outside_lands_json;

COMMIT;
