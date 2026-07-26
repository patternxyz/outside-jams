import type { Performance } from "../entities/performance.entity.js";

export class PerformanceResponseDto {
  id!: string;
  artistId!: string;
  date!: string;
  startTime!: Date | null;
  endTime!: Date | null;
  location!: string | null;

  static fromEntity(performance: Performance): PerformanceResponseDto {
    const dto = new PerformanceResponseDto();
    dto.id = performance.id;
    dto.artistId = performance.artistId;
    dto.date = performance.date;
    dto.startTime = performance.startTime;
    dto.endTime = performance.endTime;
    dto.location = performance.location;
    return dto;
  }
}
