import { describe, expect, it, vi } from "vitest";

import { TagsService } from "./tags.service.js";

describe("TagsService", () => {
  it("loads and serializes tags for one user", async () => {
    const tagsRepository = {
      find: vi
        .fn()
        .mockResolvedValue([
          { userId: "user-id", artistId: "artist-2", tags: ["following", "top"] },
        ]),
    };
    const service = new TagsService(tagsRepository as never);

    await expect(service.findByUserId("user-id")).resolves.toEqual([
      { artistId: "artist-2", tags: ["following", "top"] },
    ]);
    expect(tagsRepository.find).toHaveBeenCalledWith({
      where: { userId: "user-id" },
      order: { artistId: "ASC" },
    });
  });
});
