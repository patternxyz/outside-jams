import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { ArtistResponseDto } from "./dto/artist-response.dto.js";
import { Artist } from "./entities/artist.entity.js";

@Injectable()
export class ArtistsService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistsRepository: Repository<Artist>
  ) {}

  async findAll(): Promise<ArtistResponseDto[]> {
    const artists = await this.artistsRepository.find({
      order: { name: "ASC", id: "ASC" },
    });

    return artists.map(ArtistResponseDto.fromEntity);
  }

  async findById(id: string): Promise<ArtistResponseDto> {
    const artist = await this.artistsRepository.findOneBy({ id });

    if (!artist) {
      throw new NotFoundException(`Artist ${id} was not found`);
    }

    return ArtistResponseDto.fromEntity(artist);
  }
}
