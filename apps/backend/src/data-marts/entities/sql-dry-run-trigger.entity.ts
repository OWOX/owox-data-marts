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
   * ID of the user's project
   */
  @Column()
  projectId: string;

  /**
   * SQL query to validate
   */
  @Column({ type: 'text' })
  sql: string;
}
