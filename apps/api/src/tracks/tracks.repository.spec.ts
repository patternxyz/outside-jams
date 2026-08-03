import { describe, expect, it, vi } from "vitest";

import { TracksRepository } from "./tracks.repository.js";

describe("TracksRepository", () => {
  it("finds catalog tracks by the public artist id", async () => {
    const artistId = "a10d7f0c-91d2-5b36-bff2-6cb527feb624";
    const tracks = [
      {
        artistId,
        albumId: "album-1",
        name: "Track 1",
        duration: 123_000,
        previewUrl: null,
        uri: "spotify:track:track-1",
      },
    ];
    const query = vi.fn().mockResolvedValue(tracks);
    const repository = new TracksRepository({ query } as never);

    await expect(repository.findByPublicArtistId(artistId)).resolves.toEqual(tracks);
    expect(query).toHaveBeenCalledOnce();

    const [sql, parameters] = query.mock.calls[0] as [string, string[]];
    expect(sql).toContain("FROM public.artists AS artist");
    expect(sql).toContain("JOIN spotify.tracks AS track");
    expect(sql).toContain("track.artist_id = artist.spotify_id");
    expect(parameters).toEqual([artistId]);
  });
});
