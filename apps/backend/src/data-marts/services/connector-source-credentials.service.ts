import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectorSourceCredentials } from '../entities/connector-source-credentials.entity';

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
   * @param secrets - Updated secret values
   * @returns Updated ConnectorSourceCredentials entity
   */
  async updateSecretsForConfig(
    id: string,
    secrets: Record<string, unknown>
  ): Promise<ConnectorSourceCredentials> {
    const existing = await this.getCredentialsById(id);

    if (!existing) {
      throw new Error(`ConnectorSourceCredentials with id ${id} not found`);
    }

    existing.credentials = secrets;
    return await this.connectorSourceCredentialsRepository.save(existing);
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
}
