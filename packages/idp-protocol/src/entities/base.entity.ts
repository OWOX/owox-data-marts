import { PrimaryColumn, CreateDateColumn, UpdateDateColumn, BeforeInsert } from 'typeorm';
import { generateId } from '../utils/id-generator.js';

export abstract class BaseEntity {
  @PrimaryColumn('text')
  id: string;

  @CreateDateColumn({
    type: 'text',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'text',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = generateId();
    }
  }
}
