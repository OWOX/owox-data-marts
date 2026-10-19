import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class ConnectorReferenceGuard {
  @PrimaryColumn()
  projectId: string;

  @Column({ type: 'int', default: 0 })
  generation: number;
}
