import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ schema: "public", name: "users" })
export class User {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
