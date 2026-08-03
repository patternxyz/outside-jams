import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const { releaseKind, positionalArguments } = parseArguments(process.argv.slice(2));
const inputPath = resolve(positionalArguments[0] ?? "data/outside_lands_2026.jsonl");
const outputPath = resolve(positionalArguments[1] ?? "data/tracks.json");
const tracksPerAlbum = positiveInteger(positionalArguments[2] ?? "3", "tracks per album");
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const market = process.env.SPOTIFY_MARKET?.trim().toUpperCase() || "US";
const requestIntervalMs = nonNegativeInteger(
  process.env.SPOTIFY_REQUEST_INTERVAL_MS ?? "1000",
  "Spotify request interval"
);
const albumPageLimit = positiveInteger(
  process.env.SPOTIFY_ALBUM_PAGE_LIMIT ?? "1",
  "Spotify album page limit"
);
const resume = process.env.SPOTIFY_RESUME?.trim().toLowerCase() !== "false";
const releaseGroup = releaseKind === "ep" ? "single" : "album";
const releaseLabel = releaseKind.toUpperCase();

const SPOTIFY_API_ORIGIN = "https://api.spotify.com";
const MAX_RETRIES = 5;
let nextSpotifyRequestAt = 0;

if (!clientId || !clientSecret) {
  throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required");
}

function parseArguments(arguments_) {
  let selectedReleaseKind = null;
  const positional = [];

  for (const argument of arguments_) {
    if (argument === "--ep" || argument === "--lp") {
      const candidate = argument.slice(2);
      if (selectedReleaseKind !== null && selectedReleaseKind !== candidate) {
        throw new Error("--ep and --lp cannot be used together");
      }
      selectedReleaseKind = candidate;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    positional.push(argument);
  }

  if (positional.length > 3) {
    throw new Error("Usage: fetch-spotify-artist-tracks.mjs [--lp|--ep] [input] [output] [count]");
  }
  return { releaseKind: selectedReleaseKind ?? "lp", positionalArguments: positional };
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function nonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

class SpotifyQuotaError extends Error {
  constructor(retryAfterSeconds, detail) {
    super(`Spotify quota exceeded; retry after ${retryAfterSeconds} seconds${detail}`);
    this.name = "SpotifyQuotaError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForRequestSlot() {
  const waitMilliseconds = Math.max(nextSpotifyRequestAt - Date.now(), 0);
  if (waitMilliseconds > 0) await delay(waitMilliseconds);
  nextSpotifyRequestAt = Date.now() + requestIntervalMs;
}

async function responseError(response) {
  const body = await response.json().catch(() => null);
  const message = body?.error?.message ?? body?.error_description;
  return message ? `: ${message}` : "";
}

async function getAccessToken() {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(
      `Spotify token request failed (${response.status})${await responseError(response)}`
    );
  }

  const body = await response.json();
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("Spotify returned an invalid access token");
  }
  return body.access_token;
}

async function getSpotifyJson(url, accessToken, attempt = 0) {
  await waitForRequestSlot();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 429) {
    const retryAfterHeader = Number(response.headers.get("retry-after") ?? 1);
    const retryAfterSeconds =
      Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : 1;
    throw new SpotifyQuotaError(retryAfterSeconds, await responseError(response));
  }

  if (response.status >= 500 && attempt < MAX_RETRIES) {
    await delay(2 ** attempt * 1_000);
    return getSpotifyJson(url, accessToken, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(
      `Spotify request failed (${response.status})${await responseError(response)}: ${url.pathname}`
    );
  }

  return response.json();
}

function isLaterAlbum(candidate, current) {
  if (current === null) return true;
  const candidateDate = typeof candidate.release_date === "string" ? candidate.release_date : "";
  const currentDate = typeof current.release_date === "string" ? current.release_date : "";
  return (
    candidateDate > currentDate || (candidateDate === currentDate && candidate.id > current.id)
  );
}

function isRequestedRelease(release) {
  if (releaseKind === "lp") return release?.album_type === "album";
  return (
    release?.album_type === "single" &&
    Number.isSafeInteger(release.total_tracks) &&
    release.total_tracks > 1
  );
}

async function getLatestRelease(artistId, accessToken) {
  let offset = 0;
  let pageCount = 0;
  let latestAlbum = null;
  const seenAlbumIds = new Set();

  while (true) {
    const url = new URL(`/v1/artists/${encodeURIComponent(artistId)}/albums`, SPOTIFY_API_ORIGIN);
    url.search = new URLSearchParams({
      include_groups: releaseGroup,
      market,
      limit: "10",
      offset: String(offset),
    }).toString();

    const page = await getSpotifyJson(url, accessToken);
    pageCount += 1;
    if (!Array.isArray(page.items)) {
      throw new Error(`Spotify returned invalid albums for artist ${artistId}`);
    }

    for (const album of page.items) {
      if (
        !isRequestedRelease(album) ||
        typeof album.id !== "string" ||
        !album.id ||
        seenAlbumIds.has(album.id)
      ) {
        continue;
      }
      seenAlbumIds.add(album.id);
      if (isLaterAlbum(album, latestAlbum)) latestAlbum = album;
    }

    offset += page.items.length;
    if (
      page.items.length === 0 ||
      offset >= Number(page.total ?? 0) ||
      pageCount >= albumPageLimit
    ) {
      break;
    }
  }

  return latestAlbum;
}

async function getAlbumTracks(artistId, albumId, accessToken) {
  const url = new URL(`/v1/albums/${encodeURIComponent(albumId)}/tracks`, SPOTIFY_API_ORIGIN);
  url.search = new URLSearchParams({
    market,
    limit: String(Math.min(tracksPerAlbum, 50)),
    offset: "0",
  }).toString();

  const page = await getSpotifyJson(url, accessToken);
  if (!Array.isArray(page.items)) {
    throw new Error(`Spotify returned invalid tracks for album ${albumId}`);
  }

  return page.items.slice(0, tracksPerAlbum).map((track) => {
    if (
      typeof track?.id !== "string" ||
      typeof track.name !== "string" ||
      typeof track.duration_ms !== "number" ||
      typeof track.uri !== "string"
    ) {
      throw new Error(`Spotify returned an invalid track for album ${albumId}`);
    }

    return {
      artistId,
      albumId,
      name: track.name,
      duration: track.duration_ms,
      preview_url: typeof track.preview_url === "string" ? track.preview_url : null,
      uri: track.uri,
    };
  });
}

async function writeTracks(tracks) {
  try {
    await writeFile(temporaryPath, `${JSON.stringify(tracks, null, 2)}\n`, "utf8");
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function isTrack(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.artistId === "string" &&
    typeof value.albumId === "string" &&
    typeof value.name === "string" &&
    typeof value.duration === "number" &&
    (value.preview_url === null || typeof value.preview_url === "string") &&
    typeof value.uri === "string"
  );
}

async function readExistingTracks(artistIds) {
  if (!resume) return [];

  let source;
  try {
    source = await readFile(outputPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const existingTracks = JSON.parse(source);
  if (!Array.isArray(existingTracks) || !existingTracks.every(isTrack)) {
    throw new Error(`${outputPath} does not contain a valid tracks array`);
  }
  return existingTracks.filter((track) => artistIds.has(track.artistId));
}

const source = await readFile(inputPath, "utf8");
const artists = source
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line))
  .filter((artist) => typeof artist.spotifyId === "string" && artist.spotifyId)
  .filter(
    (artist, index, allArtists) =>
      allArtists.findIndex((candidate) => candidate.spotifyId === artist.spotifyId) === index
  );
const artistIds = new Set(artists.map((artist) => artist.spotifyId));
const tracks = await readExistingTracks(artistIds);
const completedArtistIds = new Set(tracks.map((track) => track.artistId));
const accessToken = await getAccessToken();
await writeTracks(tracks);
console.log(
  `Processing ${artists.length} artists for ${releaseLabel} releases at most once every ${requestIntervalMs}ms; scanning up to ${albumPageLimit} release page(s) each`
);

let quotaError = null;

for (const [index, artist] of artists.entries()) {
  if (completedArtistIds.has(artist.spotifyId)) {
    console.log(`[${index + 1}/${artists.length}] ${artist.name}: already checkpointed`);
    continue;
  }

  try {
    const latestRelease = await getLatestRelease(artist.spotifyId, accessToken);
    if (latestRelease === null) {
      console.warn(`[${index + 1}/${artists.length}] ${artist.name}: no ${releaseLabel} found`);
      continue;
    }

    const albumTracks = await getAlbumTracks(artist.spotifyId, latestRelease.id, accessToken);
    tracks.push(...albumTracks);
    completedArtistIds.add(artist.spotifyId);
    await writeTracks(tracks);
    console.log(
      `[${index + 1}/${artists.length}] ${artist.name}: ${latestRelease.name} (${albumTracks.length} tracks)`
    );
  } catch (error) {
    if (!(error instanceof SpotifyQuotaError)) throw error;
    quotaError = error;
    break;
  }
}

if (quotaError) {
  const retryAt = new Date(Date.now() + quotaError.retryAfterSeconds * 1_000).toISOString();
  console.error(
    `${quotaError.message}. Checkpointed ${tracks.length} tracks to ${outputPath}; rerun after ${retryAt}.`
  );
  process.exitCode = 1;
} else {
  console.log(`Wrote ${tracks.length} tracks to ${outputPath}`);
}
