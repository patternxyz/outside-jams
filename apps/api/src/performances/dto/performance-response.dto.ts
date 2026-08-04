import type {
  PerformanceChange,
  PerformanceChangeType,
} from "../entities/performance-change.entity.js";

export class PreviousPerformanceResponseDto {
  id!: string;
  date!: string;
  startTime!: Date | null;
  endTime!: Date | null;
  location!: string | null;
}

export class PerformanceChangeResponseDto {
  type!: PerformanceChangeType;
  fields!: string[];
  detectedAt!: Date;
  previous!: PreviousPerformanceResponseDto | null;
}

export class PerformanceResponseDto {
  id!: string;
  artistId!: string;
  date!: string;
  startTime!: Date | null;
  endTime!: Date | null;
  location!: string | null;
  change!: PerformanceChangeResponseDto;

  static fromEntity(performance: PerformanceChange): PerformanceResponseDto {
    const dto = new PerformanceResponseDto();
    dto.id = performance.id;
    dto.artistId = performance.artistId;
    dto.date = performance.date;
    dto.startTime = performance.startTime;
    dto.endTime = performance.endTime;
    dto.location = performance.location;
    dto.change = {
      type: performance.changeType,
      fields: performance.changedFields,
      detectedAt: performance.detectedAt,
      previous: performance.previousPerformanceId
        ? {
            id: performance.previousPerformanceId,
            date: performance.previousDate!,
            startTime: performance.previousStartTime,
            endTime: performance.previousEndTime,
            location: performance.previousLocation,
          }
        : null,
    };
    return dto;
  }
}
