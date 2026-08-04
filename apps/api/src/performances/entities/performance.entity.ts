import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";

import { Artist } from "../../artists/entities/artist.entity.js";

@Index("performances_date_only_idx", ["date"])
@Index("performances_starts_idx", ["startTime"])
@Index("performances_location_idx", ["location"])
@Index("performances_current_key_idx", ["performanceKey", "validTo"])
@Index("performances_event_key_valid_to_idx", ["eventKey", "validTo"])
@Entity({ name: "performances" })
export class Performance {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @ForeignKey(() => Artist, "id", { name: "performances_artist_id_fkey" })
  @Column({ name: "artist_id", type: "uuid" })
  artistId!: string;

  @Column({ name: "performance_key", type: "uuid" })
  performanceKey!: string;

  @Column({ name: "event_key", type: "text" })
  eventKey!: string;

  @Column({ name: "date_only", type: "date" })
  date!: string;

  @Column({ name: "starts", type: "timestamptz", nullable: true })
  startTime!: Date | null;

  @Column({ name: "ends", type: "timestamptz", nullable: true })
  endTime!: Date | null;

  @Column({ type: "text", nullable: true })
  location!: string | null;

  @Column({ name: "valid_from", type: "timestamptz" })
  validFrom!: Date;

  @Column({ name: "valid_to", type: "timestamptz", nullable: true })
  validTo!: Date | null;
}
