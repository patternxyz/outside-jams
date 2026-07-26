import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { FindOptionsWhere, Repository } from "typeorm";

import { FindPerformancesQueryDto } from "./dto/find-performances-query.dto.js";
import { PerformanceResponseDto } from "./dto/performance-response.dto.js";
import { Performance } from "./entities/performance.entity.js";

@Injectable()
export class PerformancesService {
  constructor(
    @InjectRepository(Performance)
    private readonly performancesRepository: Repository<Performance>
  ) {}

  async findAll(filters: FindPerformancesQueryDto): Promise<PerformanceResponseDto[]> {
    const where: FindOptionsWhere<Performance> = {};

    if (filters.date !== undefined) where.date = filters.date;
    if (filters.artistId !== undefined) where.artistId = filters.artistId;
    if (filters.startTime !== undefined) where.startTime = new Date(filters.startTime);
    if (filters.location !== undefined) where.location = filters.location;

    const performances = await this.performancesRepository.find({
      where,
      order: { date: "ASC", startTime: "ASC", id: "ASC" },
    });

    return performances.map(PerformanceResponseDto.fromEntity);
  }

  async findById(id: string): Promise<PerformanceResponseDto> {
    const performance = await this.performancesRepository.findOneBy({ id });

    if (!performance) {
      throw new NotFoundException(`Performance ${id} was not found`);
    }

    return PerformanceResponseDto.fromEntity(performance);
  }
}
