import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { SpotifySyncDispatcher } from "./spotify-sync.dispatcher.js";

describe("SpotifySyncDispatcher", () => {
  it("runs asynchronously in development without creating a Cloud Task", async () => {
    const syncService = { sync: vi.fn().mockResolvedValue(undefined) };
    const dispatcher = new SpotifySyncDispatcher(
      new ConfigService({ NODE_ENV: "development" }),
      syncService as never
    );

    await dispatcher.dispatch("8b0dbbf5-7f26-4647-9569-cd36b811edc7");
    expect(syncService.sync).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(syncService.sync).toHaveBeenCalledWith("8b0dbbf5-7f26-4647-9569-cd36b811edc7");
  });
});
