import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** App classification evidence. Raw protected values live in a separately selected table. */
@Entity()
export class ConnectorAuthoringPreparation {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column()
  projectId: string;
  @Column()
  connectorId: string;
  @Column()
  userId: string;
  @Column()
  purpose: 'authoring' | 'test';
  @Column({ type: 'int' })
  revision: number;
  @Column({ type: 'int' })
  version: number;
  @Column()
  sourceDigest: string;
  @Column()
  protectedValuesId: string;
  @Column({ type: 'json' })
  safeManifest: Record<string, unknown>;
  @Column({ type: 'datetime' })
  expiresAt: Date;
  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;
}
