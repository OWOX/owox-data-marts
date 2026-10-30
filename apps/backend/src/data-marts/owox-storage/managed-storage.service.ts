import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ManagedStorage } from '../entities/managed-storage.entity';

@Injectable()
export class ManagedStorageService {
  constructor(
    @InjectRepository(ManagedStorage)
    private readonly repository: Repository<ManagedStorage>
  ) {}

  findByStorageId(storageId: string): Promise<ManagedStorage | null> {
    if (!storageId) return Promise.resolve(null);
    return this.repository.findOne({ where: { storageId } });
  }

  async findByStorageIds(ids: readonly string[]): Promise<Map<string, ManagedStorage>> {
    if (ids.length === 0) return new Map();
    const rows = await this.repository.find({ where: { storageId: In([...ids]) } });
    return new Map(rows.map(row => [row.storageId, row]));
  }

  findByProjectId(projectId: string): Promise<ManagedStorage | null> {
    return this.repository.findOne({ where: { projectId } });
  }

  create(record: Omit<ManagedStorage, 'createdAt' | 'modifiedAt'>): Promise<ManagedStorage> {
    return this.repository.save(record);
  }

  async remove(storageId: string): Promise<void> {
    await this.repository.delete({ storageId });
  }
}
