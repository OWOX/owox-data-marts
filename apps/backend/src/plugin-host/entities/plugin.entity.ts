import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { createZodTransformer } from '../../common/zod/zod-transformer';
import { SyncReport, SyncReportSchema } from '../dto/domain/plugin-sync.dto';

/**
 * A plugin's stable operational identity, deployment-wide.
 *
 * There is deliberately no projectId: one GitHub repository is one plugin across the
 * whole deployment, and a public third-party repository may legitimately be published
 * by unrelated projects. All scoping lives in PluginPublication.
 *
 * Never hard-deleted.
 */
@Entity('plugin')
@Index('UQ_plugin_github_repo_id', ['githubRepoId'], { unique: true })
export class Plugin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * GitHub's stable numeric repository id, as a decimal string.
   *
   * This is the identity anchor, and the reason a rename or transfer resolves to the
   * same plugin instead of creating a second one. Repository owner and name are not
   * trusted for identity -- GitHub redirects the old path, and identical contents or
   * an identical delivery URL never establish identity.
   *
   * Stored as varchar, not bigint: better-sqlite3 hands bigint columns back as JS
   * numbers, so a value above 2^53 is already rounded before any transformer could
   * see it. We only ever compare these for equality, so text costs nothing.
   */
  @Column({ type: 'varchar', length: 20 })
  githubRepoId: string;

  /** Mutable management metadata, refreshed on every sync. */
  @Column({ type: 'varchar', length: 255 })
  repoOwner: string;

  @Column({ type: 'varchar', length: 255 })
  repoName: string;

  @Column({ type: 'varchar', length: 2048 })
  repoHtmlUrl: string;

  /** Drives §16 disclosure: private repositories expose owner only, never name or URL. */
  @Column({ type: 'boolean', default: false })
  isPrivateRepo: boolean;

  /**
   * Highest eligible version, set explicitly by the sync writer.
   *
   * No foreign key: plugin_version already references plugin, and a second constraint
   * back would make the pair circular to create and drop.
   */
  @Column({ type: 'varchar', length: 36, nullable: true })
  currentVersionId: string | null;

  /** Deployment-wide emergency suspension. Soft and idempotent. */
  @Column({ type: 'datetime', nullable: true })
  suspendedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  suspendedByApiKeyId: string | null;

  @Column({ type: 'text', nullable: true })
  suspensionNote: string | null;

  /** Doubles as the per-plugin sync throttle marker; see PluginService.tryClaimSyncSlot. */
  @Column({ type: 'datetime', nullable: true })
  lastSyncAt: Date | null;

  /**
   * Cross-instance sync lease. The random owner token prevents a stale worker from
   * releasing a lease reclaimed by a newer worker after the staleness window.
   */
  @Column({ type: 'varchar', length: 36, nullable: true })
  syncLeaseId: string | null;

  @Column({ type: 'datetime', nullable: true })
  syncLeaseStartedAt: Date | null;

  /**
   * When this deployment next checks GitHub for a higher version, and the member-facing
   * "next check" time.
   *
   * Null means the plugin is off daily maintenance: nothing publishes or installs it, so
   * nothing depends on it being current. Publishing, installing or restoring it puts it
   * back on the schedule after a freshness check.
   *
   * The time of day is derived from the plugin id and never drifts, so checks stay
   * spread across the day and a member-requested check does not move the slot.
   */
  @Column({ type: 'datetime', nullable: true })
  nextUpdateCheckAt: Date | null;

  @Column({
    type: 'json',
    nullable: true,
    transformer: createZodTransformer<SyncReport>(SyncReportSchema, false),
  })
  lastSyncReport: SyncReport | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
