import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { SpotifyProfileController } from "./spotify-profile.controller.js";

describe("SpotifyProfileController", () => {
  it("fetches the current user's Spotify name and image", async () => {
    const tokenService = { getValidAccessToken: vi.fn().mockResolvedValue("access-token") };
    const spotifyApi = {
      getProfile: vi.fn().mockResolvedValue({
        id: "spotify-user",
        displayName: "Listener",
        image: "https://i.scdn.co/image/profile",
      }),
    };
    const controller = new SpotifyProfileController(tokenService as never, spotifyApi as never);

    await expect(controller.profile({ session: { userId: "user-1" } } as never)).resolves.toEqual({
      name: "Listener",
      image: "https://i.scdn.co/image/profile",
    });
    expect(tokenService.getValidAccessToken).toHaveBeenCalledWith("user-1");
    expect(spotifyApi.getProfile).toHaveBeenCalledWith("access-token");
  });

  it("rejects requests without a current user", async () => {
    const controller = new SpotifyProfileController({} as never, {} as never);

    await expect(controller.profile({ session: {} } as never)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });
});
