import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  PluginActionExecutionStatus,
  type PluginActionTrigger,
} from '../enums/plugin-action-execution-status.enum';
import { JSON_TEXT } from '../utils/json-text.transformer';

/** One call of a plugin backend action. No foreign keys: the record outlives the rows it names. */
@Entity('plugin_action_execution')
@Index('UQ_plugin_action_execution_token', ['tokenHash'], { unique: true })
@Index('idx_plugin_action_execution_running', ['installationId', 'status'])
@Index('idx_plugin_action_execution_deadline', ['status', 'deadlineAt'])
@Index('idx_plugin_action_execution_starts', ['installationId', 'startedAt', 'payloadBytes'])
@Index('idx_plugin_action_execution_finished', ['finishedAt'])
@Index('idx_plugin_action_execution_payloads', ['payloadsClearedAt', 'finishedAt'])
@Index('idx_plugin_action_execution_schedule', ['scheduleId', 'status'])
@Index('idx_plugin_action_execution_queue', ['installationId', 'status', 'queuedAt'])
@Index('idx_plugin_action_execution_project_created', ['projectId', 'createdAt'])
@Index('idx_plugin_action_execution_project_user_created', ['projectId', 'userId', 'createdAt'])
@Index('idx_plugin_action_execution_schedule_created', ['scheduleId', 'createdAt'])
export class PluginActionExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  pluginId: string;

  @Column({ type: 'varchar', length: 36 })
  pluginVersionId: string;

  @Column({ type: 'varchar', length: 36 })
  installationId: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  /** The installation owner, whose authority the execution carries. */
  @Column({ type: 'varchar', length: 255 })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  /**
   * Declared `text`, but on MySQL the real column is `mediumtext` (16 MB), created by the migration.
   * Declaring `mediumtext` here crashes TypeORM's SQLite driver, and with `synchronize: false` the
   * declared type is metadata-only.
   */
  @Column({ type: 'text', nullable: true, transformer: JSON_TEXT })
  input: unknown;

  @Column({ type: 'varchar', length: 16 })
  trigger: PluginActionTrigger;

  /** The schedule that started the execution; null for a start from the plugin page. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  scheduleId: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: PluginActionExecutionStatus;

  /** The owner's role at start; the execution token carries this one, not a live read. */
  @Column({ type: 'varchar', length: 16 })
  role: string;

  /** SHA-256 hex of the execution token. The token itself is never stored. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  tokenHash: string | null;

  @Column({ type: 'datetime', nullable: true })
  deadlineAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  /** When a scheduled run began to wait for a start limit. */
  @Column({ type: 'datetime', nullable: true })
  queuedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorCode: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  errorMessage: string | null;

  /**
   * Declared `text`, but on MySQL the real column is `mediumtext` (16 MB), created by the migration.
   * Declaring `mediumtext` here crashes TypeORM's SQLite driver, and with `synchronize: false` the
   * declared type is metadata-only.
   */
  @Column({ type: 'text', nullable: true, transformer: JSON_TEXT })
  result: unknown;

  /** When the sweep cleared `input`, `result` and a plugin-authored `errorMessage`. */
  @Column({ type: 'datetime', nullable: true })
  payloadsClearedAt: Date | null;

  /** Bytes of `input` and `result` not yet cleared; the sweep resets it to 0. */
  @Column({ type: 'int', default: 0 })
  payloadBytes: number;
}
