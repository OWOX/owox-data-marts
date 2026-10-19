import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Same protection boundary as ConnectorSourceCredentials; never a response entity. */
@Entity()
export class ConnectorProtectedValues {
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
  @Column({ type: 'json', select: false })
  values: Record<string, unknown>;
}
