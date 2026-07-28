import type { Tag } from "../entities/tag.entity.js";

export class TagResponseDto {
  artistId!: string;
  tags!: string[];

  static fromEntity(tag: Tag): TagResponseDto {
    const dto = new TagResponseDto();
    dto.artistId = tag.artistId;
    dto.tags = tag.tags;
    return dto;
  }
}
