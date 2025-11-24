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
    expiresAt: Date,
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
    expiresAt?: Date
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
}
