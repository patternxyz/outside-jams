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
    images jsonb,
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

-- Keep existing installations compatible when this script is re-run after the
-- location field was added.
ALTER TABLE performances ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS images jsonb;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS album_id text;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS duration integer;
ALTER TABLE spotify.tracks ADD COLUMN IF NOT EXISTS preview_url text;
ALTER TABLE spotify.artists ADD COLUMN IF NOT EXISTS name text;

-- artist_id is already the leading column of the unique constraint above.
CREATE INDEX IF NOT EXISTS performances_date_only_idx
    ON performances (date_only);
CREATE INDEX IF NOT EXISTS performances_starts_idx
    ON performances (starts);
CREATE INDEX IF NOT EXISTS performances_location_idx
    ON performances (location);
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
