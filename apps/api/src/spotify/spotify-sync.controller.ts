import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { CloudTaskAuthGuard } from "./cloud-task-auth.guard.js";
import { SpotifySyncRequestDto } from "./dto/spotify-sync-request.dto.js";
import { SpotifySyncService } from "./spotify-sync.service.js";

@Controller("internal/spotify")
@UseGuards(CloudTaskAuthGuard)
export class SpotifySyncController {
  constructor(private readonly syncService: SpotifySyncService) {}

  @Post("sync")
  @HttpCode(204)
  @SkipThrottle()
  async sync(@Body() request: SpotifySyncRequestDto): Promise<void> {
    await this.syncService.sync(request.userId);
  }
}
