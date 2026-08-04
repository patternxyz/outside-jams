-- PostgreSQL 15+ / psql
-- Run from the repository root:
--   psql "$DATABASE_URL" -f data/import.sql
--
-- The source is JSON Lines: one complete artist document per line. \copy loads
-- each document directly into a jsonb staging row.

\set ON_ERROR_STOP on
\set event_key 'outside-lands-2026'

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS artists (
    id uuid NOT NULL,
    name text NOT NULL,
    spotify_id text,
    spotify_url text,
    instagram_url text,
    youtube_url text,
    images jsonb,
    CONSTRAINT artists_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS performances (
    id uuid NOT NULL,
    artist_id uuid NOT NULL,
    performance_key uuid NOT NULL,
    event_key text NOT NULL,
    date_only date NOT NULL,
    starts timestamptz NULL,
    ends timestamptz NULL,
    location text NULL,
    valid_from timestamptz NOT NULL,
    valid_to timestamptz NULL,
    CONSTRAINT performances_pkey PRIMARY KEY (id),
    CONSTRAINT performances_artist_id_fkey
        FOREIGN KEY (artist_id) REFERENCES artists (id)
);

CREATE SCHEMA IF NOT EXISTS spotify;

CREATE TABLE IF NOT EXISTS spotify.artists (
    id text NOT NULL,
    name text NULL,
    CONSTRAINT spotify_artists_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS spotify.tracks (
    track_id text NOT NULL,
    id text NULL,
    artist_id text NOT NULL,
    album_id text NULL,
    name text NULL,
    duration integer NULL,
    preview_url text NULL,
    CONSTRAINT spotify_tracks_pkey PRIMARY KEY (track_id, artist_id),
    CONSTRAINT spotify_tracks_artist_id_fkey
        FOREIGN KEY (artist_id) REFERENCES spotify.artists (id),
    CONSTRAINT spotify_tracks_duration_check CHECK (duration IS NULL OR duration >= 0)
);

-- Keep existing installations compatible as imported fields are added.
ALTER TABLE performances ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE performances ADD COLUMN IF NOT EXISTS event_key text;
ALTER TABLE performances ADD COLUMN IF NOT EXISTS performance_key uuid;
ALTER TABLE performances ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE performances ADD COLUMN IF NOT EXISTS valid_to timestamptz;
UPDATE performances SET event_key = :'event_key' WHERE event_key IS NULL;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'performances'
          AND column_name = 'deleted_at'
    ) THEN
        UPDATE performances
        SET valid_from = COALESCE(valid_from, deleted_at),
            valid_to = COALESCE(valid_to, deleted_at)
        WHERE deleted_at IS NOT NULL;
    END IF;
END
$$;
UPDATE performances
SET performance_key = COALESCE(
        performance_key,
        uuid_generate_v5(
            '7c121c77-625b-49e7-b84c-c54628f61bd2'::uuid,
            'performance:' || event_key || ':' || artist_id::text
        )
    ),
    valid_from = COALESCE(valid_from, now());
ALTER TABLE performances
    ALTER COLUMN event_key SET NOT NULL,
    ALTER COLUMN performance_key SET NOT NULL,
    ALTER COLUMN valid_from SET NOT NULL;
ALTER TABLE performances DROP CONSTRAINT IF EXISTS performances_artist_date_times_key;
DROP INDEX IF EXISTS performances_event_key_deleted_at_idx;
ALTER TABLE performances DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS images jsonb;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS album_id text;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS duration integer;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS preview_url text;
ALTER TABLE spotify.artists ADD COLUMN IF NOT EXISTS name text;

CREATE INDEX IF NOT EXISTS performances_date_only_idx
    ON performances (date_only);
CREATE INDEX IF NOT EXISTS performances_starts_idx
    ON performances (starts);
CREATE INDEX IF NOT EXISTS performances_location_idx
    ON performances (location);
CREATE INDEX IF NOT EXISTS performances_current_key_idx
    ON performances (performance_key, valid_to);
CREATE INDEX IF NOT EXISTS performances_event_key_valid_to_idx
    ON performances (event_key, valid_to);
CREATE INDEX IF NOT EXISTS tracks_artist_id_idx
    ON spotify.tracks (artist_id);
CREATE UNIQUE INDEX IF NOT EXISTS tracks_track_id_artist_id_idx
    ON spotify.tracks (track_id, artist_id);
CREATE UNIQUE INDEX IF NOT EXISTS tracks_id_idx
    ON spotify.tracks (id)
    WHERE id IS NOT NULL;

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

CREATE UNLOGGED TABLE import_staging.outside_lands_performances (
    performance_key uuid PRIMARY KEY,
    artist_id uuid NOT NULL,
    date_only date NOT NULL,
    starts timestamptz NULL,
    ends timestamptz NULL,
    location text NULL
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
        ) AS youtube_url,
        CASE
            WHEN jsonb_typeof(artist -> 'images') = 'array'
                THEN artist -> 'images'
            ELSE NULL
        END AS images
    FROM staged_artists
),
deduplicated_artists AS (
    SELECT DISTINCT ON (id)
        id,
        name,
        spotify_id,
        spotify_url,
        instagram_url,
        youtube_url,
        images
    FROM normalized_artists
    ORDER BY id, name, spotify_url, instagram_url, youtube_url, images
)
INSERT INTO artists (
    id,
    name,
    spotify_id,
    spotify_url,
    instagram_url,
    youtube_url,
    images
)
SELECT
    id,
    name,
    spotify_id,
    spotify_url,
    instagram_url,
    youtube_url,
    images
FROM deduplicated_artists
WHERE true
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    spotify_id = EXCLUDED.spotify_id,
    spotify_url = EXCLUDED.spotify_url,
    instagram_url = EXCLUDED.instagram_url,
    youtube_url = EXCLUDED.youtube_url,
    images = EXCLUDED.images;

INSERT INTO spotify.artists (id, name)
SELECT DISTINCT ON (btrim(payload ->> 'spotifyId'))
    btrim(payload ->> 'spotifyId'),
    NULLIF(btrim(payload ->> 'name'), '')
FROM import_staging.outside_lands_json
WHERE NULLIF(btrim(payload ->> 'spotifyId'), '') IS NOT NULL
ORDER BY btrim(payload ->> 'spotifyId'), NULLIF(btrim(payload ->> 'name'), '') NULLS LAST
ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, spotify.artists.name);

-- Older application migrations populated spotify.tracks before the artist
-- identity table existed. Preserve those mappings and make them valid foreign
-- key targets before adding the constraint.
INSERT INTO spotify.artists (id)
SELECT DISTINCT artist_id
FROM spotify.tracks
WHERE NULLIF(btrim(artist_id), '') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

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
            FOREIGN KEY (artist_id) REFERENCES spotify.artists (id);
    END IF;
END
$$;

WITH staged_tracks AS (
    SELECT
        regexp_replace(btrim(track ->> 'uri'), '^spotify:track:', '') AS track_id,
        btrim(track ->> 'uri') AS id,
        btrim(track ->> 'artistId') AS artist_id,
        btrim(track ->> 'albumId') AS album_id,
        track ->> 'name' AS name,
        (track ->> 'duration')::integer AS duration,
        NULLIF(btrim(track ->> 'preview_url'), '') AS preview_url
    FROM import_staging.outside_lands_json
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(payload -> 'tracks', '[]'::jsonb)
    ) AS tracks (track)
),
deduplicated_tracks AS (
    SELECT DISTINCT ON (id)
        track_id,
        id,
        artist_id,
        album_id,
        name,
        duration,
        preview_url
    FROM staged_tracks
    ORDER BY id, artist_id, album_id, name
)
INSERT INTO spotify.tracks (
    track_id,
    id,
    artist_id,
    album_id,
    name,
    duration,
    preview_url
)
SELECT
    track_id,
    id,
    artist_id,
    album_id,
    name,
    duration,
    preview_url
FROM deduplicated_tracks
WHERE track_id <> '' AND id <> '' AND artist_id <> '' AND album_id <> ''
ON CONFLICT (track_id, artist_id) DO UPDATE SET
    id = EXCLUDED.id,
    artist_id = EXCLUDED.artist_id,
    album_id = EXCLUDED.album_id,
    name = EXCLUDED.name,
    duration = EXCLUDED.duration,
    preview_url = EXCLUDED.preview_url;

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
        COALESCE(
            NULLIF(btrim(performance ->> 'stage'), ''),
            NULLIF(btrim(performance ->> 'location'), '')
        ) AS location
    FROM staged_artists
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(artist -> 'performances', '[]'::jsonb)
    ) AS performances (performance)
)
INSERT INTO import_staging.outside_lands_performances (
    performance_key,
    artist_id,
    date_only,
    starts,
    ends,
    location
)
SELECT
    uuid_generate_v5(
        '7c121c77-625b-49e7-b84c-c54628f61bd2'::uuid,
        'performance:' || :'event_key'::text || ':' || artist_id::text
    ),
    artist_id,
    date_only,
    starts,
    ends,
    location
FROM staged_performances;

-- Close current versions that were removed or whose schedule fields changed.
-- An empty staging schedule is treated as an incomplete source, not a deletion.
UPDATE performances AS current
SET valid_to = CURRENT_TIMESTAMP
WHERE current.event_key = :'event_key'
  AND current.valid_to IS NULL
  AND EXISTS (SELECT 1 FROM import_staging.outside_lands_performances)
  AND NOT EXISTS (
      SELECT 1
      FROM import_staging.outside_lands_performances AS imported
      WHERE imported.performance_key = current.performance_key
        AND imported.date_only IS NOT DISTINCT FROM current.date_only
        AND imported.starts IS NOT DISTINCT FROM current.starts
        AND imported.ends IS NOT DISTINCT FROM current.ends
        AND imported.location IS NOT DISTINCT FROM current.location
  );

-- Insert first or replacement versions. Unchanged current versions are retained.
INSERT INTO performances (
    id,
    artist_id,
    performance_key,
    event_key,
    date_only,
    starts,
    ends,
    location,
    valid_from,
    valid_to
)
SELECT
    uuid_generate_v4(),
    imported.artist_id,
    imported.performance_key,
    :'event_key'::text,
    imported.date_only,
    imported.starts,
    imported.ends,
    imported.location,
    CURRENT_TIMESTAMP,
    NULL
FROM import_staging.outside_lands_performances AS imported
WHERE NOT EXISTS (
    SELECT 1
    FROM performances AS current
    WHERE current.performance_key = imported.performance_key
      AND current.valid_to IS NULL
);

DROP VIEW IF EXISTS performance_changes;
CREATE VIEW performance_changes AS
WITH current_versions AS (
    SELECT * FROM performances WHERE valid_to IS NULL
),
previous_versions AS (
    SELECT DISTINCT ON (performance_key) *
    FROM performances
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
JOIN artists AS artist
    ON artist.id = COALESCE(current.artist_id, previous.artist_id);

DROP TABLE import_staging.outside_lands_performances;

DROP TABLE import_staging.outside_lands_json;

COMMIT;
