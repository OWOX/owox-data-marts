import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import type { AuthorizationContext } from '../../../idp';
import { CredentialSetup } from '../entities/credential-setup.entity';

export interface NewCredentialSetup {
  projectId: string;
  userId: string;
  mode: 'create' | 'update';
  definitionId: string | null;
  credentialId: string | null;
  title: string | null;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class CredentialSetupService {
  constructor(
    @InjectRepository(CredentialSetup) private readonly repository: Repository<CredentialSetup>
  ) {}

  async create(input: NewCredentialSetup): Promise<CredentialSetup> {
    return this.repository.save(
      this.repository.create({ ...input, status: 'pending', completedAt: null })
    );
  }

  async deleteCreatedBeforeBatch(createdBefore: Date): Promise<number> {
    const where = { createdAt: LessThanOrEqual(createdBefore) };
    const rows = await this.repository.find({ select: { id: true }, where, take: 500 });
    if (rows.length === 0) return 0;
    const result = await this.repository.delete({ ...where, id: In(rows.map(row => row.id)) });
    return result.affected ?? 0;
  }

  async getOwned(id: string, actor: AuthorizationContext): Promise<CredentialSetup> {
    const setup = await this.repository.findOneBy({
      id,
      projectId: actor.projectId,
      userId: actor.userId,
    });
    if (!setup) throw new NotFoundException('The Credential setup request was not found.');
    return setup;
  }

  async finish(
    id: string,
    actor: AuthorizationContext,
    status: 'completed' | 'cancelled',
    credentialId: string | null,
    now: Date
  ): Promise<boolean> {
    const result = await this.repository.update(
      {
        id,
        projectId: actor.projectId,
        userId: actor.userId,
        status: 'pending',
        expiresAt: MoreThan(now),
      },
      { status, credentialId, completedAt: now }
    );
    return result.affected === 1;
  }
}
