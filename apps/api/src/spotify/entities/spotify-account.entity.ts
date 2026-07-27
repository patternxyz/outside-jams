import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ schema: "spotify", name: "accounts" })
export class SpotifyAccount {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "spotify_user_id", type: "text", unique: true })
  spotifyUserId!: string;

  @Column({ name: "display_name", type: "text" })
  displayName!: string;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
