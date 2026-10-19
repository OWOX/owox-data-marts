import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Serializes every local Context reference writer in a project. */
@Entity('context_reference_guard')
export class ContextReferenceGuard {
  @PrimaryColumn({ length: 255 })
  projectId: string;

  @Column({ type: 'int', default: 0 })
  revision: number;
}
