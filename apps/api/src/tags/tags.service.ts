import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { TagResponseDto } from "./dto/tag-response.dto.js";
import { Tag } from "./entities/tag.entity.js";

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagsRepository: Repository<Tag>
  ) {}

  async findByUserId(userId: string): Promise<TagResponseDto[]> {
    const tags = await this.tagsRepository.find({
      where: { userId },
      order: { artistId: "ASC" },
    });

    return tags.map(TagResponseDto.fromEntity);
  }
}
