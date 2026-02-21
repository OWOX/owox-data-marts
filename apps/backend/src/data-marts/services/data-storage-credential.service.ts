import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { DataStorageCredential } from '../entities/data-storage-credential.entity';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import type { CredentialIdentity } from '../entities/credential-identity.type';

@Injectable()
export class DataStorageCredentialService {
  constructor(
    @InjectRepository(DataStorageCredential)
    private readonly repo: Repository<DataStorageCredential>
  ) {}

  async create(params: {
    projectId: string;
    createdById?: string | null;
    type: StorageCredentialType;
    credentials: Record<string, unknown>;
    identity?: CredentialIdentity | null;
    expiresAt?: Date | null;
  }): Promise<DataStorageCredential> {
    const entity = this.repo.create({
      projectId: params.projectId,
      createdById: params.createdById ?? null,
      type: params.type,
      credentials: params.credentials,
      identity: params.identity ?? null,
      expiresAt: params.expiresAt ?? null,
    });
    return this.repo.save(entity);
  }

  async getById(id: string): Promise<DataStorageCredential | null> {
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  async getByProjectId(projectId: string): Promise<DataStorageCredential[]> {
    return this.repo.find({ where: { projectId, deletedAt: IsNull() } });
  }

  async update(
    id: string,
    params: {
      credentials?: Record<string, unknown>;
      identity?: CredentialIdentity | null;
      expiresAt?: Date | null;
    }
  ): Promise<DataStorageCredential> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Storage credential not found: ${id}`);
    }

    if (params.credentials !== undefined) {
      existing.credentials = params.credentials;
    }
    if (params.identity !== undefined) {
      existing.identity = params.identity;
    }
    if (params.expiresAt !== undefined) {
      existing.expiresAt = params.expiresAt;
    }

    return this.repo.save(existing);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async getExpiredOAuthCredentials(): Promise<DataStorageCredential[]> {
    return this.repo.find({
      where: {
        type: StorageCredentialType.GOOGLE_OAUTH,
        expiresAt: LessThan(new Date()),
        deletedAt: IsNull(),
      },
    });
  }
}
