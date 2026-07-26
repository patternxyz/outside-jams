import {
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
