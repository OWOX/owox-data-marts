import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConnectorSourceCredentials } from '../../entities/connector-source-credentials.entity';
// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

const { GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD } = Core;
const SECRET_MASK = '**********';

@Injectable()
export class ConnectorSourceCredentialsService {
  constructor(
    @InjectRepository(ConnectorSourceCredentials)
    private readonly connectorSourceCredentialsRepository: Repository<ConnectorSourceCredentials>
  ) {}

  /**
   * Create OAuth credentials record
   * @param projectId - Project ID
   * @param userId - User ID from auth context
   * @param connectorName - Connector name
   * @param credentials - OAuth credentials (tokens, refresh tokens, etc.)
   * @param expiresAt - Token expiration date
   * @param user - User information from OAuth provider
   * @returns Created ConnectorSourceCredentials entity
   */
  async createCredentials(
    projectId: string,
    userId: string,
    connectorName: string,
    credentials: Record<string, unknown>,
    expiresAt: Date | null,
    user?: { id?: string; name?: string; email?: string; picture?: string }
  ): Promise<ConnectorSourceCredentials> {
    const credentialEntity = this.connectorSourceCredentialsRepository.create({
      projectId,
      userId,
      connectorName,
      credentials,
      user,
      expiresAt,
    });

    return await this.connectorSourceCredentialsRepository.save(credentialEntity);
  }

  /**
   * Get OAuth credentials by ID
   * @param id - ConnectorSourceCredentials ID
   * @returns ConnectorSourceCredentials entity or null
   */
  async getCredentialsById(id: string): Promise<ConnectorSourceCredentials | null> {
    return await this.connectorSourceCredentialsRepository.findOne({
      where: { id },
    });
  }

  /**
   * Get OAuth credentials by connector ID
   * @param connectorName - Connector name
   * @returns Array of ConnectorSourceCredentials entities
   */
  async getCredentialsByConnectorName(
    connectorName: string
  ): Promise<ConnectorSourceCredentials[]> {
    return await this.connectorSourceCredentialsRepository.find({
      where: { connectorName },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Update OAuth credentials
   * @param id - ConnectorSourceCredentials ID
   * @param credentials - Updated OAuth credentials
   * @param expiresAt - Updated expiration date
   * @returns Updated ConnectorSourceCredentials entity
   */
  async updateCredentials(
    id: string,
    credentials: Record<string, unknown>,
    expiresAt?: Date | null
  ): Promise<ConnectorSourceCredentials> {
    const existingCredentials = await this.getCredentialsById(id);

    if (!existingCredentials) {
      throw new Error(`ConnectorSourceCredentials with id ${id} not found`);
    }

    existingCredentials.credentials = credentials;
    if (expiresAt) {
      existingCredentials.expiresAt = expiresAt;
    }

    const updated = await this.connectorSourceCredentialsRepository.save(existingCredentials);

    return updated;
  }

  /**
   * Delete OAuth credentials (soft delete)
   * @param id - ConnectorSourceCredentials ID
   */
  async deleteCredentials(id: string): Promise<void> {
    await this.connectorSourceCredentialsRepository.softDelete(id);
  }

  /**
   * Delete OAuth credentials by connector ID (soft delete)
   * @param connectorName - Connector name
   */
  async deleteCredentialsByConnectorName(connectorName: string): Promise<void> {
    await this.connectorSourceCredentialsRepository.softDelete({ connectorName });
  }

  /**
   * Check if OAuth credentials are expired
   * @param id - ConnectorSourceCredentials ID
   * @returns true if expired, false otherwise. Returns false if expiresAt is null (never expires)
   */
  async isExpired(id: string): Promise<boolean> {
    const credentials = await this.getCredentialsById(id);

    if (!credentials) {
      return true;
    }

    if (!credentials.expiresAt) {
      return false;
    }

    return new Date() > credentials.expiresAt;
  }

  /**
   * Get all expired credentials
   * @returns Array of expired ConnectorSourceCredentials entities
   */
  async getExpiredCredentials(): Promise<ConnectorSourceCredentials[]> {
    return await this.connectorSourceCredentialsRepository
      .createQueryBuilder('credentials')
      .where('credentials.expiresAt < :now', { now: new Date() })
      .andWhere('credentials.deletedAt IS NULL')
      .getMany();
  }

  /**
   * Create secrets record for a specific DataMart configuration
   * Used for non-OAuth secrets that are extracted from DataMart definition
   * @param projectId - Project ID
   * @param connectorName - Connector name
   * @param dataMartId - DataMart ID
   * @param configId - Configuration item _id from definition
   * @param secrets - Secret field values
   * @param userId - Optional user ID
   * @returns Created ConnectorSourceCredentials entity
   */
  async createSecretsForConfig(
    projectId: string,
    connectorName: string,
    dataMartId: string,
    configId: string,
    secrets: Record<string, unknown>,
    userId?: string
  ): Promise<ConnectorSourceCredentials> {
    const entity = this.connectorSourceCredentialsRepository.create({
      projectId,
      connectorName,
      dataMartId,
      configId,
      credentials: secrets,
      userId,
    });

    return await this.connectorSourceCredentialsRepository.save(entity);
  }

  /**
   * Get secrets by DataMart ID and configuration ID
   * @param dataMartId - DataMart ID
   * @param configId - Configuration item _id
   * @returns ConnectorSourceCredentials entity or null
   */
  async getSecretsByDataMartAndConfig(
    dataMartId: string,
    configId: string
  ): Promise<ConnectorSourceCredentials | null> {
    return await this.connectorSourceCredentialsRepository.findOne({
      where: { dataMartId, configId },
    });
  }

  /**
   * Update secrets for a specific configuration
   * @param id - ConnectorSourceCredentials ID
   * @param projectId - Project ID for ownership validation
   * @param secrets - Updated secret values
   * @returns Updated ConnectorSourceCredentials entity
   * @throws Error if not found or projectId doesn't match (IDOR protection)
   */
  async updateSecretsForConfig(
    id: string,
    projectId: string,
    secrets: Record<string, unknown>,
    ownership?: { connectorName: string; dataMartId: string; configId: string }
  ): Promise<ConnectorSourceCredentials> {
    const existing = await this.getCredentialsById(id);

    if (!existing) {
      throw new Error(`ConnectorSourceCredentials with id ${id} not found`);
    }

    if (existing.projectId !== projectId) {
      throw new Error(`Unauthorized: secrets do not belong to this project`);
    }

    if (
      ownership &&
      (existing.connectorName !== ownership.connectorName ||
        existing.dataMartId !== ownership.dataMartId ||
        existing.configId !== ownership.configId)
    ) {
      throw new Error('Unauthorized: secrets do not belong to this connector configuration');
    }

    const shouldPreserveGeneratedRefreshToken = this.shouldPreserveGeneratedRefreshToken(
      existing.credentials,
      secrets
    );

    await this.updateCredentialsJson(id, projectId, secrets, shouldPreserveGeneratedRefreshToken);
    const updated = await this.getCredentialsById(id);

    return updated ?? { ...existing, credentials: secrets };
  }

  async updateCredentialFields(
    id: string,
    projectId: string,
    updates: Record<string, unknown>,
    expectedCurrentValues?: Record<string, unknown>
  ): Promise<ConnectorSourceCredentials> {
    const generatedRefreshToken = updates[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD];
    if (typeof generatedRefreshToken !== 'string') {
      throw new Error(
        `Only ${GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD} can be updated by field update`
      );
    }

    const existing = await this.getCredentialsById(id);
    if (!existing) {
      throw new Error(`ConnectorSourceCredentials with id ${id} not found`);
    }

    if (existing.projectId !== projectId) {
      throw new Error(`Unauthorized: credentials do not belong to this project`);
    }

    const queryBuilder = this.connectorSourceCredentialsRepository
      .createQueryBuilder()
      .update(ConnectorSourceCredentials)
      .set({
        credentials: () => {
          return `JSON_SET(
            credentials,
            '$.${GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD}',
            :generatedRefreshToken
          )`;
        },
      })
      .where('id = :id', { id })
      .andWhere('projectId = :projectId', { projectId })
      .setParameters({ generatedRefreshToken });

    if (
      expectedCurrentValues &&
      Object.prototype.hasOwnProperty.call(
        expectedCurrentValues,
        GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD
      )
    ) {
      const expectedGeneratedRefreshToken =
        expectedCurrentValues[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD];
      const generatedRefreshTokenExpression = this.getJsonExtractTextExpression(
        'credentials',
        `$.${GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD}`
      );

      if (typeof expectedGeneratedRefreshToken === 'string') {
        queryBuilder
          .andWhere(`${generatedRefreshTokenExpression} = :expectedGeneratedRefreshToken`)
          .setParameters({ expectedGeneratedRefreshToken });
      } else {
        queryBuilder.andWhere(`${generatedRefreshTokenExpression} IS NULL`);
      }
    }

    const updateResult = await queryBuilder.execute();
    if (updateResult.affected === 0) {
      return existing;
    }

    const updated = await this.getCredentialsById(id);

    return (
      updated ?? {
        ...existing,
        credentials: {
          ...existing.credentials,
          [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: generatedRefreshToken,
        },
      }
    );
  }

  private getJsonExtractTextExpression(column: string, path: string): string {
    const databaseType = this.getDatabaseType();

    if (databaseType === 'mysql' || databaseType === 'mariadb') {
      return `JSON_UNQUOTE(JSON_EXTRACT(${column}, '${path}'))`;
    }

    return `JSON_EXTRACT(${column}, '${path}')`;
  }

  private getDatabaseType(): string | undefined {
    const repository = this
      .connectorSourceCredentialsRepository as Repository<ConnectorSourceCredentials> & {
      manager?: {
        connection?: { options?: { type?: string } };
        dataSource?: { options?: { type?: string } };
      };
    };

    return (
      repository.manager?.connection?.options?.type ?? repository.manager?.dataSource?.options?.type
    );
  }

  private async updateCredentialsJson(
    id: string,
    projectId: string,
    credentials: Record<string, unknown>,
    preserveGeneratedRefreshToken: boolean
  ): Promise<void> {
    const serializedCredentials = JSON.stringify(credentials);
    const generatedRefreshTokenPath = `$.${GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD}`;
    const credentialsExpression = preserveGeneratedRefreshToken
      ? `CASE
          WHEN JSON_EXTRACT(credentials, '${generatedRefreshTokenPath}') IS NOT NULL
          THEN JSON_SET(
            :credentials,
            '${generatedRefreshTokenPath}',
            JSON_EXTRACT(credentials, '${generatedRefreshTokenPath}')
          )
          ELSE :credentials
        END`
      : ':credentials';

    await this.connectorSourceCredentialsRepository
      .createQueryBuilder()
      .update(ConnectorSourceCredentials)
      .set({ credentials: () => credentialsExpression })
      .where('id = :id', { id })
      .andWhere('projectId = :projectId', { projectId })
      .setParameters({ credentials: serializedCredentials })
      .execute();
  }

  private shouldPreserveGeneratedRefreshToken(
    existingCredentials: Record<string, unknown>,
    incomingSecrets: Record<string, unknown>
  ): boolean {
    if (incomingSecrets[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD] !== undefined) {
      return false;
    }

    const incomingRefreshToken = this.getRefreshTokenValue(incomingSecrets);
    if (!this.isRefreshTokenValue(incomingRefreshToken)) {
      return true;
    }

    return incomingRefreshToken === this.getRefreshTokenValue(existingCredentials);
  }

  private getRefreshTokenValue(credentials: Record<string, unknown>): unknown {
    const refreshTokenEntry = Object.entries(credentials).find(([key]) => {
      return key === 'refresh_token' || key === 'RefreshToken' || key.endsWith('.RefreshToken');
    });

    return refreshTokenEntry?.[1];
  }

  private isRefreshTokenValue(value: unknown): value is string {
    return typeof value === 'string' && value !== '' && value !== SECRET_MASK;
  }

  /**
   * Delete all secrets associated with a DataMart (soft delete)
   * Called when DataMart is deleted
   * @param dataMartId - DataMart ID
   */
  async deleteSecretsByDataMart(dataMartId: string): Promise<void> {
    await this.connectorSourceCredentialsRepository.softDelete({ dataMartId });
  }

  /**
   * Get all secrets for a DataMart
   * @param dataMartId - DataMart ID
   * @returns Array of ConnectorSourceCredentials entities
   */
  async getSecretsByDataMart(dataMartId: string): Promise<ConnectorSourceCredentials[]> {
    return await this.connectorSourceCredentialsRepository.find({
      where: { dataMartId },
    });
  }

  /**
   * Get credentials by multiple IDs (batch fetch to avoid N+1)
   * @param ids - Array of ConnectorSourceCredentials IDs
   * @returns Map of ID to ConnectorSourceCredentials entity
   */
  async getCredentialsByIds(ids: string[]): Promise<Map<string, ConnectorSourceCredentials>> {
    if (ids.length === 0) {
      return new Map();
    }

    const entities = await this.connectorSourceCredentialsRepository.find({
      where: { id: In(ids) },
    });
    const map = new Map<string, ConnectorSourceCredentials>();
    for (const entity of entities) {
      map.set(entity.id, entity);
    }
    return map;
  }
}
