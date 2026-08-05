import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';

/**
 * Makes a plugin discoverable in the Gallery at one authority level.
 *
 * A publication controls listing, not permission to install: a member reaching the
 * plugin by direct link can install it with no publication at all. Unpublishing is
 * catalog-only and never touches installations.
 *
 * Soft-deactivated, never deleted, so republishing restores history instead of
 * creating a duplicate.
 */
@Entity('plugin_publication')
@Index('UQ_plugin_publication_key', ['uniquenessKey'], { unique: true })
@Index('idx_plugin_publication_lookup', ['pluginId', 'scope', 'isActive'])
export class PluginPublication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  pluginId: string;

  @Column({ type: 'varchar', length: 16 })
  scope: PluginPublicationScope;

  /** Null at deployment scope, where the audience lives in plugin_publication_project. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  projectId: string | null;

  /** Member scope only. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  userId: string | null;

  /**
   * Deployment scope only, and indivisible: individual projects cannot be excluded
   * from it. Switching between this and a selected audience is two explicit commands.
   */
  @Column({ type: 'boolean', default: false })
  allProjects: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Precomputed identity of the logical publication:
   *   deployment:{pluginId} | project:{pluginId}:{projectId} | member:{pluginId}:{projectId}:{userId}
   *
   * A composite unique index over the nullable columns would not work -- both SQLite
   * and MySQL treat NULLs as distinct, so "one deployment publication per plugin"
   * would silently allow duplicates. One computed column with a plain unique index is
   * portable across both.
   */
  @Column({ type: 'varchar', length: 512 })
  uniquenessKey: string;

  @Column({ type: 'datetime', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  unpublishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
