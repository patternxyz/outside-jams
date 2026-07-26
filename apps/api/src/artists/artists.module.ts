import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ArtistsController } from "./artists.controller.js";
import { Artist } from "./entities/artist.entity.js";
import { ArtistsService } from "./artists.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([Artist])],
  controllers: [ArtistsController],
  providers: [ArtistsService],
})
export class ArtistsModule {}
