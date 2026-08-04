import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, type FindOptionsWhere, type Repository } from "typeorm";

import { FindPerformancesQueryDto } from "./dto/find-performances-query.dto.js";
import { PerformanceResponseDto } from "./dto/performance-response.dto.js";
import { PerformanceChange } from "./entities/performance-change.entity.js";

@Injectable()
export class PerformancesService {
  constructor(
    @InjectRepository(PerformanceChange)
    private readonly performancesRepository: Repository<PerformanceChange>
  ) {}

  async findAll(filters: FindPerformancesQueryDto): Promise<PerformanceResponseDto[]> {
    const where: FindOptionsWhere<PerformanceChange> = {};

    if (!filters.includeRemoved) where.changeType = Not("removed");

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
    const performance = await this.performancesRepository.findOneBy({
      id,
      changeType: Not("removed"),
    });

    if (!performance) {
      throw new NotFoundException(`Performance ${id} was not found`);
    }

    return PerformanceResponseDto.fromEntity(performance);
  }
}
