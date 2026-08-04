import { ViewColumn, ViewEntity } from "typeorm";

export type PerformanceChangeType = "added" | "changed" | "removed";

@ViewEntity({ name: "performance_changes", synchronize: false })
export class PerformanceChange {
  @ViewColumn()
  id!: string;

  @ViewColumn({ name: "performance_key" })
  performanceKey!: string;

  @ViewColumn({ name: "event_key" })
  eventKey!: string;

  @ViewColumn({ name: "artist_id" })
  artistId!: string;

  @ViewColumn({ name: "artist_name" })
  artistName!: string;

  @ViewColumn({ name: "date_only" })
  date!: string;

  @ViewColumn({ name: "starts" })
  startTime!: Date | null;

  @ViewColumn({ name: "ends" })
  endTime!: Date | null;

  @ViewColumn()
  location!: string | null;

  @ViewColumn({ name: "change_type" })
  changeType!: PerformanceChangeType;

  @ViewColumn({ name: "previous_performance_id" })
  previousPerformanceId!: string | null;

  @ViewColumn({ name: "current_performance_id" })
  currentPerformanceId!: string | null;

  @ViewColumn({ name: "previous_date" })
  previousDate!: string | null;

  @ViewColumn({ name: "previous_starts" })
  previousStartTime!: Date | null;

  @ViewColumn({ name: "previous_ends" })
  previousEndTime!: Date | null;

  @ViewColumn({ name: "previous_location" })
  previousLocation!: string | null;

  @ViewColumn({ name: "changed_fields" })
  changedFields!: string[];

  @ViewColumn({ name: "detected_at" })
  detectedAt!: Date;
}
