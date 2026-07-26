import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";

import { FindPerformancesQueryDto } from "./dto/find-performances-query.dto.js";
import { PerformanceResponseDto } from "./dto/performance-response.dto.js";
import { PerformancesService } from "./performances.service.js";

@Controller("performances")
export class PerformancesController {
  constructor(private readonly performancesService: PerformancesService) {}

  @Get()
  findAll(@Query() filters: FindPerformancesQueryDto): Promise<PerformanceResponseDto[]> {
    return this.performancesService.findAll(filters);
  }

  @Get(":id")
  findById(@Param("id", ParseUUIDPipe) id: string): Promise<PerformanceResponseDto> {
    return this.performancesService.findById(id);
  }
}
