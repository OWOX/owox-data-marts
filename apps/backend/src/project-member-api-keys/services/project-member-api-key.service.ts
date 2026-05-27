import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Role } from '@owox/idp-protocol';
import { IsNull, Repository } from 'typeorm';
import type { ProjectMemberApiKeyMetadata } from '../dto/domain/project-member-api-key-metadata.dto';
import { ProjectMemberApiKey } from '../entities/project-member-api-key.entity';
import { ProjectMemberApiKeyMapper } from '../mappers/project-member-api-key.mapper';
import { ProjectMemberApiKeyCryptoService } from './project-member-api-key-crypto.service';

export type CreateProjectMemberApiKeyResult = {
  apiKey: ProjectMemberApiKeyMetadata;
  apiKeySecret: string;
};

@Injectable()
export class ProjectMemberApiKeyService {
  constructor(
    @InjectRepository(ProjectMemberApiKey)
    private readonly projectMemberApiKeyRepository: Repository<ProjectMemberApiKey>,
    private readonly cryptoService: ProjectMemberApiKeyCryptoService,
    private readonly mapper: ProjectMemberApiKeyMapper
  ) {}

  async createForMember(
    projectId: string,
    userId: string,
    name: string,
    role: Role | null,
    readOnly: boolean,
    expiresAt?: Date | null
  ): Promise<CreateProjectMemberApiKeyResult> {
    const apiKeyId = this.cryptoService.generateApiKeyId();
    const apiKeySecret = this.cryptoService.generateApiKeySecret();
    const storedHash = await this.cryptoService.hashSecret(apiKeyId, apiKeySecret);
    const apiKey = this.projectMemberApiKeyRepository.create({
      apiKeyId,
      projectId,
      userId,
      name,
      role,
      readOnly,
      expiresAt: expiresAt ?? null,
      revokedAt: null,
      lastAuthenticatedAt: null,
      ...storedHash,
    });

    return {
      apiKey: this.mapper.toMetadata(await this.projectMemberApiKeyRepository.save(apiKey)),
      apiKeySecret,
    };
  }

  async listForMember(
    projectId: string,
    userId: string,
    includeRevoked = false
  ): Promise<ProjectMemberApiKeyMetadata[]> {
    const apiKeys = await this.projectMemberApiKeyRepository.find({
      where: includeRevoked ? { projectId, userId } : { projectId, userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    return this.mapper.toMetadataList(apiKeys);
  }

  async updateName(
    projectId: string,
    userId: string,
    apiKeyId: string,
    name: string
  ): Promise<ProjectMemberApiKeyMetadata | null> {
    const apiKey = await this.projectMemberApiKeyRepository.findOne({
      where: { projectId, userId, apiKeyId },
    });
    if (!apiKey) {
      return null;
    }

    apiKey.name = name;
    return this.mapper.toMetadata(await this.projectMemberApiKeyRepository.save(apiKey));
  }

  async revoke(
    projectId: string,
    userId: string,
    apiKeyId: string,
    revokedAt = new Date()
  ): Promise<ProjectMemberApiKeyMetadata | null> {
    const apiKey = await this.projectMemberApiKeyRepository.findOne({
      where: { projectId, userId, apiKeyId },
    });
    if (!apiKey) {
      return null;
    }

    apiKey.revokedAt = revokedAt;
    return this.mapper.toMetadata(await this.projectMemberApiKeyRepository.save(apiKey));
  }

  async findByApiKeyId(apiKeyId: string): Promise<ProjectMemberApiKey | null> {
    return this.projectMemberApiKeyRepository.findOne({ where: { apiKeyId } });
  }

  async markAuthenticated(
    apiKeyId: string,
    authenticatedAt: Date
  ): Promise<ProjectMemberApiKey | null> {
    const apiKey = await this.findByApiKeyId(apiKeyId);
    if (!apiKey) {
      return null;
    }

    apiKey.lastAuthenticatedAt = authenticatedAt;
    return this.projectMemberApiKeyRepository.save(apiKey);
  }
}
