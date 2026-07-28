import { Controller, Get, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { TagResponseDto } from "./dto/tag-response.dto.js";
import { TagsService } from "./tags.service.js";

@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  findCurrentUserTags(@Req() request: Request): Promise<TagResponseDto[]> {
    if (!request.session.userId) {
      throw new UnauthorizedException("Spotify account is not connected");
    }

    return this.tagsService.findByUserId(request.session.userId);
  }
}
