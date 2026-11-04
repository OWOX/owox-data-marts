import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
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

  findActive(): Promise<ManagedStorage[]> {
    return this.repository.find({ where: { deprovisionedAt: IsNull() } });
  }

  findPendingDeprovision(): Promise<ManagedStorage[]> {
    return this.repository.find({ where: { deprovisionPending: true } });
  }

  // An update, never an insert: a record the customer deleted meanwhile stays deleted.
  async updateActive(
    storageId: string,
    changes: Partial<Pick<ManagedStorage, 'notPaidSince' | 'lastActivityAt'>>
  ): Promise<boolean> {
    const { affected } = await this.repository.update(
      { storageId, deprovisionedAt: IsNull() },
      changes
    );
    return affected === 1;
  }

  // False when the record is not deleted, so a restore that lost a race changes nothing.
  async markRestored(storageId: string, now: Date): Promise<boolean> {
    const { affected } = await this.repository.update(
      { storageId, deprovisionedAt: Not(IsNull()) },
      { deprovisionedAt: null, deprovisionPending: false, notPaidSince: null, lastActivityAt: now }
    );
    return affected === 1;
  }

  // Before the first destructive call, so a deletion that fails partway stays deleted and retryable.
  async markDeleting(storageId: string, now: Date): Promise<boolean> {
    const { affected } = await this.repository.update(
      { storageId, deprovisionedAt: IsNull() },
      { deprovisionedAt: now, deprovisionPending: true }
    );
    return affected === 1;
  }

  async setDeprovisionPending(storageId: string, pending: boolean): Promise<void> {
    await this.repository.update(
      { storageId, deprovisionedAt: Not(IsNull()) },
      { deprovisionPending: pending }
    );
  }

  create(record: Omit<ManagedStorage, 'createdAt' | 'modifiedAt'>): Promise<ManagedStorage> {
    return this.repository.save(record);
  }

  async remove(storageId: string): Promise<void> {
    await this.repository.delete({ storageId });
  }
}
