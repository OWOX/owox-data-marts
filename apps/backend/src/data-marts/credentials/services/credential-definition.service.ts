import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CredentialDefinitionContractSchema } from '../credential.types';
import type { ResolvedCredentialDefinition } from '../dto/credential-api.dto';
import { CredentialDefinitionVersion } from '../entities/credential-definition-version.entity';
import { CredentialExternalDefinition } from '../entities/credential-external-definition.entity';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from './builtin-credential-definitions';

@Injectable()
export class CredentialDefinitionService {
  private readonly builtins = new Map(
    BUILTIN_CREDENTIAL_DEFINITIONS.map(definition => [definition.id, definition])
  );

  constructor(
    @InjectRepository(CredentialExternalDefinition)
    private readonly externalDefinitions: Repository<CredentialExternalDefinition>,
    @InjectRepository(CredentialDefinitionVersion)
    private readonly definitionVersions: Repository<CredentialDefinitionVersion>
  ) {}

  async list(): Promise<ResolvedCredentialDefinition[]> {
    const external = await this.externalDefinitions.find();
    const resolvedExternal = await Promise.all(
      external.map(definition => this.resolveExternal(definition))
    );
    return [
      ...BUILTIN_CREDENTIAL_DEFINITIONS.map(contract => ({
        definitionId: contract.id,
        source: 'builtin' as const,
        compatibilityLine: null,
        contract,
      })),
      ...resolvedExternal.filter(
        (definition): definition is ResolvedCredentialDefinition => definition !== null
      ),
    ];
  }

  async get(definitionId: string): Promise<ResolvedCredentialDefinition> {
    const builtin = this.builtins.get(definitionId);
    if (builtin) {
      return {
        definitionId: builtin.id,
        source: 'builtin',
        compatibilityLine: null,
        contract: builtin,
      };
    }

    const external = await this.externalDefinitions.findOneBy({
      id: definitionId,
    });
    if (!external) {
      throw new BadRequestException(`Credential definition ${definitionId} is not available`);
    }

    const resolved = await this.resolveExternal(external);
    if (!resolved) {
      throw new BadRequestException(`Credential definition ${definitionId} has no active version`);
    }
    return resolved;
  }

  async getForCredential(input: {
    definitionId: string;
    acceptedCompatibilityLine: string | null;
  }): Promise<ResolvedCredentialDefinition> {
    const builtin = this.builtins.get(input.definitionId);
    if (builtin) {
      return {
        definitionId: builtin.id,
        source: 'builtin',
        compatibilityLine: null,
        contract: builtin,
      };
    }

    const external = await this.externalDefinitions.findOneBy({
      id: input.definitionId,
    });
    if (!external) {
      throw new NotFoundException('Credential definition is no longer available');
    }

    if (
      !external.currentVersionId ||
      external.currentCompatibilityLine !== input.acceptedCompatibilityLine
    ) {
      throw new ConflictException('Credential definition update requires maintainer consent');
    }
    const version = await this.definitionVersions.findOneBy({ id: external.currentVersionId });
    if (!version) {
      throw new NotFoundException('No compatible Credential definition version is available');
    }

    const parsed = CredentialDefinitionContractSchema.safeParse(version.contract);
    if (!parsed.success) {
      throw new BadRequestException('Stored Credential definition is invalid');
    }
    return {
      definitionId: external.id,
      source: 'external',
      compatibilityLine: version.compatibilityLine,
      contract: parsed.data,
    };
  }

  async getForView(input: { definitionId: string }): Promise<ResolvedCredentialDefinition> {
    return this.get(input.definitionId);
  }

  private async resolveExternal(
    definition: CredentialExternalDefinition
  ): Promise<ResolvedCredentialDefinition | null> {
    if (!definition.currentVersionId) return null;
    const version = await this.definitionVersions.findOneBy({
      id: definition.currentVersionId,
    });
    if (!version) return null;
    const parsed = CredentialDefinitionContractSchema.safeParse(version.contract);
    if (!parsed.success) return null;
    return {
      definitionId: definition.id,
      source: 'external',
      compatibilityLine: version.compatibilityLine,
      contract: parsed.data,
    };
  }
}
