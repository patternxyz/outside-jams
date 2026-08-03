import { IsUUID } from "class-validator";

export class FindTracksQueryDto {
  @IsUUID()
  artistId!: string;
}
