import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { SpotifySyncService } from "./spotify-sync.service.js";

describe("SpotifySyncService", () => {
  const userId = "8b0dbbf5-7f26-4647-9569-cd36b811edc7";
  const accountId = "spotify-user-id";

  function dependencies() {
    const accounts = {
      findOneBy: vi.fn().mockResolvedValue({ id: accountId }),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    const users = {
      findOneBy: vi.fn().mockResolvedValue({ id: userId, spotifyAccountId: accountId }),
    };
    const manager = {
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      transaction: vi.fn(async (work: (transactionManager: typeof manager) => Promise<void>) =>
        work(manager)
      ),
    };
    const spotifyApi = {
      getTopArtistIds: vi.fn().mockResolvedValue(["spotify-1", "spotify-2"]),
      getFollowedArtistIds: vi.fn().mockResolvedValue(["spotify-3", "spotify-4"]),
    };
    const tokenService = { getValidAccessToken: vi.fn().mockResolvedValue("access-token") };
    const service = new SpotifySyncService(
      accounts as never,
      users as never,
      dataSource as never,
      spotifyApi as never,
      tokenService as never
    );
    return { accounts, dataSource, manager, service, spotifyApi, tokenService, users };
  }

  it("replaces artist snapshots, projects tags, and completes in a transaction", async () => {
    const { accounts, dataSource, manager, service, spotifyApi, tokenService } = dependencies();

    await service.sync(userId);

    expect(accounts.update).toHaveBeenCalledTimes(7);
    expect(accounts.update).toHaveBeenNthCalledWith(
      1,
      { id: accountId },
      expect.objectContaining({
        lastSyncStatus: "started",
        lastUpdate: "Sync started",
        updatedAt: expect.any(Date),
      })
    );
    expect(accounts.update).toHaveBeenNthCalledWith(
      2,
      { id: accountId },
      expect.objectContaining({ lastUpdate: "Fetched 2 top artists", updatedAt: expect.any(Date) })
    );
    expect(accounts.update).toHaveBeenNthCalledWith(
      3,
      { id: accountId },
      expect.objectContaining({
        lastUpdate: "Fetched 2 followed artists",
        updatedAt: expect.any(Date),
      })
    );
    expect(accounts.update).toHaveBeenNthCalledWith(
      4,
      { id: accountId },
      expect.objectContaining({ lastUpdate: "Saved 2 top artists", updatedAt: expect.any(Date) })
    );
    expect(accounts.update).toHaveBeenNthCalledWith(
      5,
      { id: accountId },
      expect.objectContaining({
        lastUpdate: "Saved 2 followed artists",
        updatedAt: expect.any(Date),
      })
    );
    expect(accounts.update).toHaveBeenNthCalledWith(
      6,
      { id: accountId },
      expect.objectContaining({ lastUpdate: "Projected artist tags", updatedAt: expect.any(Date) })
    );
    expect(accounts.update).toHaveBeenNthCalledWith(
      7,
      { id: accountId },
      expect.objectContaining({
        lastSyncStatus: "completed",
        lastUpdate: "Sync completed",
        updatedAt: expect.any(Date),
      })
    );
    expect(tokenService.getValidAccessToken).toHaveBeenCalledWith(userId);
    expect(spotifyApi.getTopArtistIds).toHaveBeenCalledWith("access-token");
    expect(spotifyApi.getFollowedArtistIds).toHaveBeenCalledWith("access-token");
    expect(spotifyApi.getTopArtistIds.mock.invocationCallOrder[0]).toBeLessThan(
      spotifyApi.getFollowedArtistIds.mock.invocationCallOrder[0]
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(4);
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("spotify.top_artists"),
      [accountId, ["spotify-1", "spotify-2"]]
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("spotify.followed_artists"),
      [accountId, ["spotify-3", "spotify-4"]]
    );
    expect(manager.query).toHaveBeenNthCalledWith(3, "DELETE FROM public.tags WHERE user_id = $1", [
      userId,
    ]);
    expect(manager.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("INSERT INTO public.tags"),
      [userId, accountId]
    );
    expect(manager.query.mock.calls[0][0]).toContain("unnest($2::text[])");
    expect(manager.query.mock.calls[0][0]).not.toContain("public.artists");
    expect(manager.query.mock.calls[1][0]).toContain("unnest($2::text[])");
    expect(manager.query.mock.calls[1][0]).not.toContain("public.artists");
    expect(manager.query.mock.calls[3][0]).toContain("WHERE fa.account_id = $2");
    expect(manager.query.mock.calls[3][0]).toContain("WHERE ta.account_id = $2");
    expect(manager.query.mock.calls[3][0]).toContain("$1::uuid AS user_id");
    expect(manager.query.mock.calls[3][0]).toContain("public.artists");
    expect(manager.query.mock.calls[3][0]).toContain("artist.spotify_id = fa.artist_id");
    expect(manager.query.mock.calls[3][0]).toContain("artist.spotify_id = ta.artist_id");
    expect(manager.query.mock.calls[3][0]).toContain("array_agg(tag ORDER BY tag)");
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      accounts.update.mock.invocationCallOrder[3]
    );
    expect(accounts.update.mock.invocationCallOrder[3]).toBeLessThan(
      manager.query.mock.invocationCallOrder[1]
    );
    expect(manager.query.mock.invocationCallOrder[1]).toBeLessThan(
      accounts.update.mock.invocationCallOrder[4]
    );
    expect(accounts.update.mock.invocationCallOrder[4]).toBeLessThan(
      manager.query.mock.invocationCallOrder[2]
    );
    expect(manager.query.mock.invocationCallOrder[2]).toBeLessThan(
      manager.query.mock.invocationCallOrder[3]
    );
    expect(manager.query.mock.invocationCallOrder[3]).toBeLessThan(
      accounts.update.mock.invocationCallOrder[5]
    );
  });

  it("rejects a task for an unknown Spotify account", async () => {
    const { accounts, service, tokenService } = dependencies();
    accounts.findOneBy.mockResolvedValue(null);

    await expect(service.sync(userId)).rejects.toBeInstanceOf(NotFoundException);
    expect(tokenService.getValidAccessToken).not.toHaveBeenCalled();
  });

  it("preserves existing top artists and records failed when Spotify fails", async () => {
    const { accounts, dataSource, service, spotifyApi } = dependencies();
    const failure = new Error("Spotify failed");
    spotifyApi.getTopArtistIds.mockRejectedValue(failure);

    await expect(service.sync(userId)).rejects.toBe(failure);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(spotifyApi.getFollowedArtistIds).not.toHaveBeenCalled();
    expect(accounts.update).toHaveBeenLastCalledWith(
      { id: accountId },
      expect.objectContaining({
        lastSyncStatus: "failed",
        lastUpdate: "Sync failed while fetching top artists",
        updatedAt: expect.any(Date),
      })
    );
  });

  it("does not persist either snapshot when followed artists fail", async () => {
    const { accounts, dataSource, service, spotifyApi } = dependencies();
    const failure = new Error("Followed artists failed");
    spotifyApi.getFollowedArtistIds.mockRejectedValue(failure);

    await expect(service.sync(userId)).rejects.toBe(failure);

    expect(spotifyApi.getTopArtistIds).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(accounts.update).toHaveBeenLastCalledWith(
      { id: accountId },
      expect.objectContaining({
        lastSyncStatus: "failed",
        lastUpdate: "Sync failed while fetching followed artists",
        updatedAt: expect.any(Date),
      })
    );
  });

  it("records failed when the transactional merge rolls back", async () => {
    const { accounts, dataSource, service } = dependencies();
    const failure = new Error("insert failed");
    dataSource.transaction.mockRejectedValue(failure);

    await expect(service.sync(userId)).rejects.toBe(failure);

    expect(accounts.update).toHaveBeenLastCalledWith(
      { id: accountId },
      expect.objectContaining({
        lastSyncStatus: "failed",
        lastUpdate: "Sync failed while saving top artists",
        updatedAt: expect.any(Date),
      })
    );
  });

  it("records the projection stage when rebuilding artist tags fails", async () => {
    const { accounts, manager, service } = dependencies();
    const failure = new Error("projection failed");
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(failure);

    await expect(service.sync(userId)).rejects.toBe(failure);

    expect(accounts.update).toHaveBeenLastCalledWith(
      { id: accountId },
      expect.objectContaining({
        lastSyncStatus: "failed",
        lastUpdate: "Sync failed while projecting artist tags",
        updatedAt: expect.any(Date),
      })
    );
  });
});
