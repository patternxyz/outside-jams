import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { SpotifySyncCoordinator } from "./spotify-sync.coordinator.js";

describe("SpotifySyncCoordinator", () => {
  function setup() {
    const users = {
      findOneBy: vi.fn().mockResolvedValue({ spotifyAccountId: "spotify-user" }),
    };
    const accounts = {
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    const dispatcher = { dispatch: vi.fn().mockResolvedValue(undefined) };

    return {
      accounts,
      coordinator: new SpotifySyncCoordinator(
        users as never,
        accounts as never,
        dispatcher as never
      ),
      dispatcher,
      users,
    };
  }

  it("marks a user's sync as queued before dispatching it", async () => {
    const { accounts, coordinator, dispatcher, users } = setup();

    await coordinator.queue("user-id");

    expect(users.findOneBy).toHaveBeenCalledWith({ id: "user-id" });
    expect(accounts.update).toHaveBeenCalledWith(
      { id: "spotify-user" },
      expect.objectContaining({ lastSyncStatus: "started", lastUpdate: "Sync queued" })
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith("user-id");
  });

  it("records a terminal status when dispatching fails", async () => {
    const { accounts, coordinator, dispatcher } = setup();
    const dispatchError = new Error("queue unavailable");
    dispatcher.dispatch.mockRejectedValue(dispatchError);

    await expect(coordinator.queue("user-id")).rejects.toBe(dispatchError);

    expect(accounts.update).toHaveBeenNthCalledWith(
      2,
      { id: "spotify-user" },
      expect.objectContaining({
        lastSyncStatus: "failed",
        lastUpdate: "Sync could not be started",
      })
    );
  });

  it("rejects users without a connected Spotify account", async () => {
    const { coordinator, users } = setup();
    users.findOneBy.mockResolvedValue(null);

    await expect(coordinator.queue("user-id")).rejects.toBeInstanceOf(NotFoundException);
  });
});
