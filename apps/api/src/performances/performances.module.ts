import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Performance } from "./entities/performance.entity.js";
import { PerformanceChange } from "./entities/performance-change.entity.js";
import { PerformancesController } from "./performances.controller.js";
import { PerformancesService } from "./performances.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([Performance, PerformanceChange])],
  controllers: [PerformancesController],
  providers: [PerformancesService],
})
export class PerformancesModule {}
