import { Module } from "@nestjs/common";

import { TracksController } from "./tracks.controller.js";
import { TracksRepository } from "./tracks.repository.js";
import { TracksService } from "./tracks.service.js";

@Module({
  controllers: [TracksController],
  providers: [TracksRepository, TracksService],
})
export class TracksModule {}
