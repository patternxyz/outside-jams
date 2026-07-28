import { Column, Entity, PrimaryColumn } from "typeorm";

export type SpotifySyncStatus = "started" | "completed" | "failed";

@Entity({ schema: "spotify", name: "accounts" })
export class SpotifyAccount {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "spotify_user_id", type: "text", unique: true })
  spotifyUserId!: string;

  @Column({ name: "display_name", type: "text" })
  displayName!: string;

  @Column({ name: "last_sync_date", type: "timestamptz", nullable: true })
  lastSyncDate!: Date | null;

  @Column({ name: "last_sync_status", type: "text", nullable: true })
  lastSyncStatus!: SpotifySyncStatus | null;

  @Column({ name: "last_update", type: "text", nullable: true })
  lastUpdate!: string | null;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
