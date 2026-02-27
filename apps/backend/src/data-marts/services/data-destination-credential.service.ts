import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { DataDestinationCredential } from '../entities/data-destination-credential.entity';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import type { CredentialIdentity } from '../entities/credential-identity.type';
import type { StoredDestinationCredentials } from '../entities/stored-destination-credentials.type';

@Injectable()
export class DataDestinationCredentialService {
  constructor(
    @InjectRepository(DataDestinationCredential)
    private readonly repo: Repository<DataDestinationCredential>
  ) {}

  async create(params: {
    projectId: string;
    createdById?: string | null;
    type: DestinationCredentialType;
    credentials: StoredDestinationCredentials;
    identity?: CredentialIdentity | null;
    expiresAt?: Date | null;
  }): Promise<DataDestinationCredential> {
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

  async getById(id: string): Promise<DataDestinationCredential | null> {
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  async getByProjectId(projectId: string): Promise<DataDestinationCredential[]> {
    return this.repo.find({ where: { projectId, deletedAt: IsNull() } });
  }

  async update(
    id: string,
    params: {
      credentials?: StoredDestinationCredentials;
      identity?: CredentialIdentity | null;
      expiresAt?: Date | null;
    }
  ): Promise<DataDestinationCredential> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Destination credential not found: ${id}`);
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

  async getExpiredOAuthCredentials(): Promise<DataDestinationCredential[]> {
    return this.repo.find({
      where: {
        type: DestinationCredentialType.GOOGLE_OAUTH,
        expiresAt: LessThan(new Date()),
        deletedAt: IsNull(),
      },
    });
  }
}
