import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";

export class FindPerformancesQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  includeRemoved?: boolean;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date must use the YYYY-MM-DD format",
  })
  @IsDateString({ strict: true })
  date?: string;

  @IsOptional()
  @IsUUID()
  artistId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  startTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
