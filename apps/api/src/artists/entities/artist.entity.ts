import { Column, Entity, PrimaryColumn } from "typeorm";

export type ArtistImage = {
  url: string;
  height: number | null;
  width: number | null;
};

@Entity({ name: "artists" })
export class Artist {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ name: "spotify_id", type: "text", nullable: true })
  spotifyId!: string | null;

  @Column({ name: "spotify_url", type: "text", nullable: true })
  spotifyUrl!: string | null;

  @Column({ name: "instagram_url", type: "text", nullable: true })
  instagramUrl!: string | null;

  @Column({ name: "youtube_url", type: "text", nullable: true })
  youtubeUrl!: string | null;

  @Column({ type: "jsonb", nullable: true })
  images!: ArtistImage[] | null;
}
