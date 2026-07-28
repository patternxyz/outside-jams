import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Tag } from "./entities/tag.entity.js";
import { TagsController } from "./tags.controller.js";
import { TagsService } from "./tags.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([Tag])],
  controllers: [TagsController],
  providers: [TagsService],
})
export class TagsModule {}
