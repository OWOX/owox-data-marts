import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One project in a deployment publication's selected audience.
 *
 * Only used when the publication is not `allProjects`. Publishing with further project
 * IDs adds rows; unpublishing with project IDs deactivates only those; when the last
 * active row goes, the publication itself becomes inactive.
 *
 * Deactivated rather than deleted, so the audience history survives.
 */
@Entity('plugin_publication_project')
@Index('UQ_plugin_publication_project', ['publicationId', 'projectId'], { unique: true })
@Index('idx_plugin_publication_project_project', ['projectId', 'isActive'])
export class PluginPublicationProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  publicationId: string;

  @Column({ type: 'varchar', length: 255 })
  projectId: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
