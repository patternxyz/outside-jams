import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const dataPath = resolve(process.argv[2] ?? "data/outside_lands_2026.jsonl");
const temporaryPath = `${dataPath}.tmp`;
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required");
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
    throw new Error(`Spotify token request failed (${response.status})`);
  }

  const body = await response.json();
  return body.access_token;
}

async function getArtistImages(spotifyId, accessToken, attempt = 1) {
  const response = await fetch(`https://api.spotify.com/v1/artists/${spotifyId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 429 && attempt <= 3) {
    const retryAfterSeconds = Number(response.headers.get("retry-after") ?? 1);
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, Math.max(retryAfterSeconds, 1) * 1_000)
    );
    return getArtistImages(spotifyId, accessToken, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`Spotify artist ${spotifyId} request failed (${response.status})`);
  }

  const artist = await response.json();
  if (!Array.isArray(artist.images)) {
    throw new Error(`Spotify artist ${spotifyId} returned an invalid images value`);
  }

  return artist.images.map(({ url, height, width }) => ({ url, height, width }));
}

const source = await readFile(dataPath, "utf8");
const artists = source
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line));
const accessToken = await getAccessToken();

let enrichedCount = 0;
for (const artist of artists) {
  artist.images = artist.spotifyId ? await getArtistImages(artist.spotifyId, accessToken) : null;
  if (artist.spotifyId) enrichedCount += 1;
}

try {
  await writeFile(
    temporaryPath,
    `${artists.map((artist) => JSON.stringify(artist)).join("\n")}\n`,
    "utf8"
  );
  await rename(temporaryPath, dataPath);
} catch (error) {
  await unlink(temporaryPath).catch(() => undefined);
  throw error;
}

console.log(`Updated ${enrichedCount} Spotify artists in ${dataPath}`);
