import { type MigrationInterface, type QueryRunner } from "typeorm";

export class AddSpotifySyncStatus1753600000000 implements MigrationInterface {
  name = "AddSpotifySyncStatus1753600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE spotify.accounts
        ADD COLUMN IF NOT EXISTS last_sync_date timestamptz,
        ADD COLUMN IF NOT EXISTS last_sync_status text;

      ALTER TABLE spotify.accounts
        DROP CONSTRAINT IF EXISTS accounts_last_sync_status_check,
        ADD CONSTRAINT accounts_last_sync_status_check
          CHECK (last_sync_status IN ('started', 'completed', 'failed'));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE spotify.accounts
        DROP CONSTRAINT IF EXISTS accounts_last_sync_status_check,
        DROP COLUMN IF EXISTS last_sync_status,
        DROP COLUMN IF EXISTS last_sync_date;
    `);
  }
}
