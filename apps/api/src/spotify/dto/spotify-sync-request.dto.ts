import { IsUUID } from "class-validator";

export class SpotifySyncRequestDto {
  @IsUUID()
  userId!: string;
}
