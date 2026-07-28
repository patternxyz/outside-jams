import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { User } from "../users/entities/user.entity.js";
import { SpotifyAccount } from "./entities/spotify-account.entity.js";
import { SpotifySyncDispatcher } from "./spotify-sync.dispatcher.js";

@Injectable()
export class SpotifySyncCoordinator {
  private readonly logger = new Logger(SpotifySyncCoordinator.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(SpotifyAccount)
    private readonly accounts: Repository<SpotifyAccount>,
    private readonly dispatcher: SpotifySyncDispatcher
  ) {}

  async queue(userId: string): Promise<void> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user?.spotifyAccountId) throw new NotFoundException("Spotify account not found");

    const accountId = user.spotifyAccountId;
    const queued = await this.accounts.update(
      { id: accountId },
      {
        lastSyncStatus: "started",
        lastUpdate: "Sync queued",
        updatedAt: new Date(),
      }
    );
    if (!queued.affected) throw new NotFoundException("Spotify account not found");

    try {
      await this.dispatcher.dispatch(userId);
    } catch (error) {
      try {
        await this.accounts.update(
          { id: accountId },
          {
            lastSyncStatus: "failed",
            lastUpdate: "Sync could not be started",
            updatedAt: new Date(),
          }
        );
      } catch (statusError) {
        this.logger.error(`Could not record sync dispatch failure for user ${userId}`, statusError);
      }
      throw error;
    }
  }
}
