import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Durable test evidence contains counts and references, never provider rows or diagnostics. */
@Entity()
export class ConnectorAuthoringTestRun {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;
  @Column()
  projectId: string;
  @Column()
  userId: string;
  @Column()
  connectorId: string;
  @Column({ type: 'int' })
  revision: number;
  @Column({ type: 'int' })
  version: number;
  @Column()
  state: 'unknown' | 'succeeded' | 'failed';
  @Column({ type: 'int', nullable: true })
  rowCount: number | null;
}
