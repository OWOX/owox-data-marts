import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import { LicenseKey } from '../entities/license-key.entity';
import { LICENSE_LIFETIME_DAYS, LicenseKeySignerService } from './license-key-signer.service';

export interface CreateLicenseKeyCommand {
  projectId: string;
  userId: string;
  name: string;
  origin: string;
}

export interface IssuedLicenseKey {
  record: LicenseKey;
  licenseKey: string;
}

@Injectable()
export class LicenseKeyService {
  constructor(
    @InjectRepository(LicenseKey)
    private readonly repository: Repository<LicenseKey>,
    private readonly signer: LicenseKeySignerService,
    private readonly publicOriginService: PublicOriginService
  ) {}

  public async create(command: CreateLicenseKeyCommand): Promise<IssuedLicenseKey> {
    const licenseKeyId = randomUUID();
    const origin = this.normalizeOrigin(command.origin);
    const expiresAt = new Date(Date.now() + LICENSE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

    const licenseKey = this.signer.sign({
      licenseKeyId,
      origin,
      billingProjectId: command.projectId,
      expiresAt,
    });

    const record = await this.repository.save(
      this.repository.create({
        licenseKeyId,
        projectId: command.projectId,
        name: command.name,
        origin,
        expiresAt,
        revokedAt: null,
        lastUsedAt: null,
        createdById: command.userId,
      })
    );

    return { record, licenseKey };
  }

  private normalizeOrigin(origin: string): string {
    try {
      return this.publicOriginService.normalizeOrigin(origin);
    } catch {
      throw new BadRequestException(
        `"${origin}" is not a valid public origin. Use a full http or https address, for example https://data-marts.example.com`
      );
    }
  }

  public list(projectId: string): Promise<LicenseKey[]> {
    return this.repository.find({
      where: { projectId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  public async rename(projectId: string, licenseKeyId: string, name: string): Promise<LicenseKey> {
    const record = await this.getOwned(projectId, licenseKeyId);
    record.name = name;
    return this.repository.save(record);
  }

  public async revoke(projectId: string, licenseKeyId: string): Promise<void> {
    const record = await this.getOwned(projectId, licenseKeyId);
    if (record.revokedAt) {
      return;
    }
    record.revokedAt = new Date();
    await this.repository.save(record);
  }

  /**
   * Returns the key only when it may still authorize runs for its signed billing project.
   */
  public async findActive(
    licenseKeyId: string,
    billingProjectId: string
  ): Promise<LicenseKey | null> {
    const record = await this.repository.findOne({ where: { licenseKeyId } });
    if (!record || record.revokedAt || record.projectId !== billingProjectId) {
      return null;
    }
    return record.expiresAt.getTime() < Date.now() ? null : record;
  }

  public async markUsed(licenseKeyId: string): Promise<void> {
    await this.repository.update({ licenseKeyId }, { lastUsedAt: new Date() });
  }

  private async getOwned(projectId: string, licenseKeyId: string): Promise<LicenseKey> {
    const record = await this.repository.findOne({ where: { licenseKeyId, projectId } });
    if (!record) {
      throw new NotFoundException('License key not found');
    }
    return record;
  }
}
