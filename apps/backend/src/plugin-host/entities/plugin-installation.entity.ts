import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One member's installation of one plugin in one project.
 *
 * Two members of the same project have separate rows, so neither can affect the
 * other's access. A control-plane record only: it stores no plugin application data
 * and restoring it guarantees nothing about the plugin's own state.
 *
 * All three identity columns are non-null, so a plain composite unique index is
 * portable here -- unlike publications, which need a computed key.
 *
 * Soft-uninstalled, never deleted, so a member can restore from history even when no
 * publication currently makes the plugin visible.
 */
@Entity('plugin_installation')
@Index('UQ_plugin_installation', ['pluginId', 'projectId', 'userId'], { unique: true })
@Index('idx_plugin_installation_member', ['projectId', 'userId', 'uninstalledAt'])
export class PluginInstallation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  pluginId: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'varchar', length: 255 })
  userId: string;

  /** First ever installation. Preserved across uninstall and restore. */
  @CreateDateColumn()
  createdAt: Date;

  /** Most recent installation or restoration. */
  @Column({ type: 'datetime' })
  installedAt: Date;

  /** Most recent soft uninstall, cleared on restore. */
  @Column({ type: 'datetime', nullable: true })
  uninstalledAt: Date | null;

  @UpdateDateColumn()
  modifiedAt: Date;
}
