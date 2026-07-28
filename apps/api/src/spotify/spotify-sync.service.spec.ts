import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { SpotifyAccount } from "./entities/spotify-account.entity.js";
import { SpotifySyncService } from "./spotify-sync.service.js";

describe("SpotifySyncService", () => {
  const userId = "8b0dbbf5-7f26-4647-9569-cd36b811edc7";

  function dependencies() {
    const accounts = { update: vi.fn().mockResolvedValue({ affected: 1 }) };
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
    };
    const tokenService = { getValidAccessToken: vi.fn().mockResolvedValue("access-token") };
    const service = new SpotifySyncService(
      accounts as never,
      dataSource as never,
      spotifyApi as never,
      tokenService as never
    );
    return { accounts, dataSource, manager, service, spotifyApi, tokenService };
  }

  it("replaces top artists in one bulk statement and completes in a transaction", async () => {
    const { accounts, dataSource, manager, service, spotifyApi, tokenService } = dependencies();

    await service.sync(userId);

    expect(accounts.update).toHaveBeenCalledTimes(1);
    expect(accounts.update).toHaveBeenCalledWith(
      { userId },
      expect.objectContaining({ lastSyncStatus: "started" })
    );
    expect(tokenService.getValidAccessToken).toHaveBeenCalledWith(userId);
    expect(spotifyApi.getTopArtistIds).toHaveBeenCalledWith("access-token");
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO"), [
      userId,
      ["spotify-1", "spotify-2"],
    ]);
    expect(manager.query.mock.calls[0][0]).toContain("unnest($2::text[])");
    expect(manager.query.mock.calls[0][0]).not.toContain("public.artists");
    expect(manager.update).toHaveBeenCalledWith(
      SpotifyAccount,
      { userId },
      expect.objectContaining({ lastSyncStatus: "completed" })
    );
  });

  it("rejects a task for an unknown Spotify account", async () => {
    const { accounts, service, tokenService } = dependencies();
    accounts.update.mockResolvedValue({ affected: 0 });

    await expect(service.sync(userId)).rejects.toBeInstanceOf(NotFoundException);
    expect(tokenService.getValidAccessToken).not.toHaveBeenCalled();
  });

  it("preserves existing top artists and records failed when Spotify fails", async () => {
    const { accounts, dataSource, service, spotifyApi } = dependencies();
    const failure = new Error("Spotify failed");
    spotifyApi.getTopArtistIds.mockRejectedValue(failure);

    await expect(service.sync(userId)).rejects.toBe(failure);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(accounts.update).toHaveBeenLastCalledWith(
      { userId },
      expect.objectContaining({ lastSyncStatus: "failed" })
    );
  });

  it("records failed when the transactional merge rolls back", async () => {
    const { accounts, dataSource, service } = dependencies();
    const failure = new Error("insert failed");
    dataSource.transaction.mockRejectedValue(failure);

    await expect(service.sync(userId)).rejects.toBe(failure);

    expect(accounts.update).toHaveBeenLastCalledWith(
      { userId },
      expect.objectContaining({ lastSyncStatus: "failed" })
    );
  });
});
