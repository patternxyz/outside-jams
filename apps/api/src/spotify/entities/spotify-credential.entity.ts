import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ schema: "spotify", name: "credentials" })
export class SpotifyCredential {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "access_token", type: "text" })
  accessToken!: string;

  @Column({ name: "refresh_token", type: "text" })
  refreshToken!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "text", array: true })
  scopes!: string[];

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
