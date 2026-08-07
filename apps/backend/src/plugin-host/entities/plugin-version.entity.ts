import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { PluginCollectionDeclaration } from '../utils/plugin-manifest.util';

/**
 * One immutable version of a plugin, anchored to a published GitHub Release and commit.
 *
 * Insert-only by design: there is no update path anywhere, so "recorded version
 * metadata cannot be mutated" is structural rather than a rule someone must remember.
 * Moving, deleting or recreating a Git tag therefore cannot rewrite history, and a
 * deleted Release leaves its version in place.
 *
 * Only eligible Releases become rows. Rejections live on Plugin.lastSyncReport.
 */
@Entity('plugin_version')
@Index('UQ_plugin_version_semver', ['pluginId', 'semver'], { unique: true })
@Index('idx_plugin_version_plugin', ['pluginId'])
export class PluginVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  pluginId: string;

  /** Canonical `X.Y.Z`, no `v` prefix. Prerelease and build metadata never reach storage. */
  @Column({ type: 'varchar', length: 32 })
  semver: string;

  /** The exact commit the manifest was read from; a moved tag cannot change it. */
  @Column({ type: 'varchar', length: 40 })
  commitSha: string;

  /** Text for the same reason as Plugin.githubRepoId: equality only, no precision traps. */
  @Column({ type: 'varchar', length: 20 })
  githubReleaseId: string;

  @Column({ type: 'varchar', length: 255 })
  tagName: string;

  /** From plugin.json at that commit. */
  @Column({ type: 'varchar', length: 255 })
  displayName: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 32 })
  deliveryType: 'remote';

  /**
   * Publisher-visible only.
   *
   * OWOX records this URL but does not pin or verify what it serves afterwards -- an
   * accepted trust model, and the reason emergency suspension exists.
   */
  @Column({ type: 'varchar', length: 2048 })
  deliveryUrl: string;

  /** Immutable storage and authorization declaration from plugin.json. */
  @Column({ type: 'json', nullable: true })
  collections: PluginCollectionDeclaration[] | null;

  @Column({ type: 'datetime', nullable: true })
  releasePublishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
