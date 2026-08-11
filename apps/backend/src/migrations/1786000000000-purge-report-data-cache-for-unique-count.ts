import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'report_data_cache';

/**
 * #6792 changes the numbers three classes of report produce (composite Unique Count, joined
 * Sum/Average, a key unique only within its join). The cache is keyed on report id + expiry alone —
 * it carries no config or SQL fingerprint, and invalidation only fires on a config edit — so an
 * untouched report would keep serving pre-fix numbers, and on BigQuery would not even re-run the
 * new SQL. Dropping the rows costs one re-read per report; leaving them serves wrong numbers.
 */
export class PurgeReportDataCacheForUniqueCount1786000000000 implements MigrationInterface {
  public readonly name = 'PurgeReportDataCacheForUniqueCount1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(TABLE)) {
      await queryRunner.query(`DELETE FROM ${TABLE}`);
    }
  }

  public async down(): Promise<void> {
    // A cache purge has no inverse — the rows it removed were derived data.
  }
}
