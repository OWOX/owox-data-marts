import { Column, Entity, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class ProjectProjection {
  @PrimaryColumn()
  projectId: string;

  @Column({ type: 'varchar' })
  projectTitle: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  modifiedAt: Date;
}
