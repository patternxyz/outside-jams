import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ schema: "public", name: "tags" })
export class Tag {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string;

  @PrimaryColumn({ name: "artist_id", type: "uuid" })
  artistId!: string;

  @Column({ type: "text", array: true })
  tags!: string[];
}
