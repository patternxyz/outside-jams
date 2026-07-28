import { describe, expect, it, vi } from "vitest";

import { SpotifyIdentityService } from "./spotify-identity.service.js";

describe("SpotifyIdentityService", () => {
  it("deletes dependent Spotify data while preserving the account and public user", async () => {
    const manager = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ spotify_account_id: "spotify-user-1" }])
        .mockResolvedValue([]),
    };
    const dataSource = {
      transaction: vi.fn(async (work: (transactionManager: typeof manager) => Promise<void>) =>
        work(manager)
      ),
    };
    const tokenService = { invalidate: vi.fn() };
    const service = new SpotifyIdentityService(
      dataSource as never,
      {} as never,
      tokenService as never
    );

    await service.disconnect("user-1");

    expect(manager.query.mock.calls).toEqual([
      ["SELECT spotify_account_id FROM public.users WHERE id = $1", ["user-1"]],
      ["DELETE FROM spotify.credentials WHERE account_id = $1", ["spotify-user-1"]],
      ["DELETE FROM spotify.top_artists WHERE account_id = $1", ["spotify-user-1"]],
      ["DELETE FROM spotify.followed_artists WHERE account_id = $1", ["spotify-user-1"]],
    ]);
    expect(manager.query.mock.calls.flatMap(([query]) => query)).not.toContain(
      expect.stringContaining("DELETE FROM spotify.accounts")
    );
    expect(manager.query.mock.calls.flatMap(([query]) => query)).not.toContain(
      expect.stringContaining("DELETE FROM public.users")
    );
    expect(tokenService.invalidate).toHaveBeenCalledWith("user-1");
  });
});
