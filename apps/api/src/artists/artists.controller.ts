import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";

import { ArtistResponseDto } from "./dto/artist-response.dto.js";
import { ArtistsService } from "./artists.service.js";

@Controller("artists")
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Get()
  findAll(): Promise<ArtistResponseDto[]> {
    return this.artistsService.findAll();
  }

  @Get(":id")
  findById(@Param("id", ParseUUIDPipe) id: string): Promise<ArtistResponseDto> {
    return this.artistsService.findById(id);
  }
}
