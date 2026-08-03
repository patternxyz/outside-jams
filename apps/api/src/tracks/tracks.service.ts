import { Injectable } from "@nestjs/common";

import { TrackResponseDto } from "./dto/track-response.dto.js";
import { TracksRepository } from "./tracks.repository.js";

@Injectable()
export class TracksService {
  constructor(private readonly tracksRepository: TracksRepository) {}

  findByArtistId(artistId: string): Promise<TrackResponseDto[]> {
    return this.tracksRepository.findByPublicArtistId(artistId);
  }
}
