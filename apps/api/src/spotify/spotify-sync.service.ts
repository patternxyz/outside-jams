import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { SpotifyAccount } from "./entities/spotify-account.entity.js";

@Injectable()
export class SpotifySyncService {
  constructor(
    @InjectRepository(SpotifyAccount)
    private readonly accounts: Repository<SpotifyAccount>
  ) {}

  async sync(userId: string): Promise<void> {
    const startedAt = new Date();
    const started = await this.accounts.update(
      { userId },
      { lastSyncDate: startedAt, lastSyncStatus: "started" }
    );
    if (!started.affected) throw new NotFoundException("Spotify account not found");

    try {
      // Spotify data synchronization will be added here. Until then, a task run
      // records the lifecycle of a successful no-op sync.
      await this.accounts.update(
        { userId },
        { lastSyncDate: new Date(), lastSyncStatus: "completed" }
      );
    } catch (error) {
      await this.accounts.update(
        { userId },
        { lastSyncDate: new Date(), lastSyncStatus: "failed" }
      );
      throw error;
    }
  }
}
