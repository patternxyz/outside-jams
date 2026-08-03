import { Controller, Get, Query } from "@nestjs/common";

import { FindTracksQueryDto } from "./dto/find-tracks-query.dto.js";
import { TrackResponseDto } from "./dto/track-response.dto.js";
import { TracksService } from "./tracks.service.js";

@Controller("tracks")
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  findAll(@Query() query: FindTracksQueryDto): Promise<TrackResponseDto[]> {
    return this.tracksService.findByArtistId(query.artistId);
  }
}
