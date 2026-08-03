import { describe, expect, it, vi } from "vitest";

import { TracksService } from "./tracks.service.js";

describe("TracksService", () => {
  it("returns tracks for a public artist id", async () => {
    const artistId = "a10d7f0c-91d2-5b36-bff2-6cb527feb624";
    const tracksRepository = {
      findByPublicArtistId: vi.fn().mockResolvedValue([]),
    };
    const service = new TracksService(tracksRepository as never);

    await expect(service.findByArtistId(artistId)).resolves.toEqual([]);
    expect(tracksRepository.findByPublicArtistId).toHaveBeenCalledWith(artistId);
  });
});
