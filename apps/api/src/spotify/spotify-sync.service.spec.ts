import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { SpotifySyncService } from "./spotify-sync.service.js";

describe("SpotifySyncService", () => {
  it("records a started and completed sync", async () => {
    const accounts = { update: vi.fn().mockResolvedValue({ affected: 1 }) };
    const service = new SpotifySyncService(accounts as never);

    await service.sync("8b0dbbf5-7f26-4647-9569-cd36b811edc7");

    expect(accounts.update).toHaveBeenCalledTimes(2);
    expect(accounts.update.mock.calls[0][1]).toMatchObject({ lastSyncStatus: "started" });
    expect(accounts.update.mock.calls[1][1]).toMatchObject({ lastSyncStatus: "completed" });
  });

  it("rejects a task for an unknown Spotify account", async () => {
    const accounts = { update: vi.fn().mockResolvedValue({ affected: 0 }) };
    const service = new SpotifySyncService(accounts as never);

    await expect(service.sync("8b0dbbf5-7f26-4647-9569-cd36b811edc7")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("records failed when the sync cannot complete", async () => {
    const failure = new Error("sync failed");
    const accounts = {
      update: vi
        .fn()
        .mockResolvedValueOnce({ affected: 1 })
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ affected: 1 }),
    };
    const service = new SpotifySyncService(accounts as never);

    await expect(service.sync("8b0dbbf5-7f26-4647-9569-cd36b811edc7")).rejects.toBe(failure);
    expect(accounts.update.mock.calls[2][1]).toMatchObject({ lastSyncStatus: "failed" });
  });
});
