import { Entity, Column } from 'typeorm';
import { UiTrigger } from '../../common/scheduler/shared/entities/ui-trigger.entity';
import { SqlDryRunResponseApiDto } from '../dto/presentation/sql-dry-run-response-api.dto';

/**
 * Entity for SQL dry run triggers.
 * Stores SQL validation requests and their results.
 */
@Entity('sql_dry_run_triggers')
export class SqlDryRunTrigger extends UiTrigger<SqlDryRunResponseApiDto> {
  /**
   * ID of the data mart for which SQL validation is performed
   */
  @Column()
  dataMartId: string;

  /**
   * SQL query to validate.
   *
   * Declared `text`, but on MySQL the real column is `mediumtext` (16 MB) -- widened by
   * migration 1790830000000 after over-long SQL failed with ER_DATA_TOO_LONG. The entity
   * keeps `text` because TypeORM's SQLite driver does not support `mediumtext` (declaring
   * it crashes startup), and with `synchronize: false` the declared type is metadata-only.
   * The request DTO caps input at the MySQL column's byte capacity.
   */
  @Column({ type: 'text' })
  sql: string;
}
