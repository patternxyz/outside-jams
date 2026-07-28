import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { TagsController } from "./tags.controller.js";

describe("TagsController", () => {
  it("returns the current user's artist tags", async () => {
    const tagsService = {
      findByUserId: vi.fn().mockResolvedValue([{ artistId: "artist-id", tags: ["top"] }]),
    };
    const controller = new TagsController(tagsService as never);

    await expect(
      controller.findCurrentUserTags({ session: { userId: "user-id" } } as never)
    ).resolves.toEqual([{ artistId: "artist-id", tags: ["top"] }]);
    expect(tagsService.findByUserId).toHaveBeenCalledWith("user-id");
  });

  it("rejects requests without a user session", () => {
    const controller = new TagsController({} as never);

    expect(() => controller.findCurrentUserTags({ session: {} } as never)).toThrow(
      UnauthorizedException
    );
  });
});
