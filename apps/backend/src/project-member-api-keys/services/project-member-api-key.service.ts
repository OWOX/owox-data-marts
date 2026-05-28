import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Role } from '@owox/idp-protocol';
import { IsNull, Repository } from 'typeorm';
import type { ProjectMemberApiKeyIssuingParameters } from '../dto/domain/project-member-api-key-issuing-parameters.dto';
import type { ProjectMemberApiKeyMetadata } from '../dto/domain/project-member-api-key-metadata.dto';
import { ProjectMemberApiKey } from '../entities/project-member-api-key.entity';
import { ProjectMemberApiKeyMapper } from '../mappers/project-member-api-key.mapper';
import {
  ProjectMemberApiKeyCryptoService,
  type ProjectMemberApiKeyStoredHash,
} from './project-member-api-key-crypto.service';

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

  async verifyCredential(
    apiKeyId: string | undefined,
    apiKeySecret: string
  ): Promise<ProjectMemberApiKeyIssuingParameters | null> {
    if (
      !apiKeyId ||
      !this.cryptoService.isValidApiKeyId(apiKeyId) ||
      !this.cryptoService.isValidApiKeySecret(apiKeySecret)
    ) {
      return null;
    }

    const apiKey = await this.findByApiKeyId(apiKeyId);
    if (!apiKey || this.isRevoked(apiKey) || this.isExpired(apiKey)) {
      return null;
    }

    const isSecretValid = await this.cryptoService.verifySecret(
      apiKeyId,
      apiKeySecret,
      this.toStoredHash(apiKey)
    );
    if (!isSecretValid) {
      return null;
    }

    return this.mapper.toIssuingParameters(apiKey);
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

  private async findByApiKeyId(apiKeyId: string): Promise<ProjectMemberApiKey | null> {
    return this.projectMemberApiKeyRepository.findOne({ where: { apiKeyId } });
  }

  private isRevoked(apiKey: ProjectMemberApiKey): boolean {
    return apiKey.revokedAt !== null;
  }

  private isExpired(apiKey: ProjectMemberApiKey): boolean {
    return apiKey.expiresAt !== null && apiKey.expiresAt.getTime() <= Date.now();
  }

  private toStoredHash(apiKey: ProjectMemberApiKey): ProjectMemberApiKeyStoredHash {
    return {
      keyHash: apiKey.keyHash,
      keyHashSalt: apiKey.keyHashSalt,
      keyHashParams: apiKey.keyHashParams as ProjectMemberApiKeyStoredHash['keyHashParams'],
    };
  }
}
