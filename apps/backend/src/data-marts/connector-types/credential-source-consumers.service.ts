import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthorizationContext } from '../../idp';
import { CredentialConsumerTitlesService } from '../credentials/services/credential-consumer-titles.service';
import { DataMart } from '../entities/data-mart.entity';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { SOURCE_BINDING_CONSUMER_TYPE } from './source-credential-state';

/** The Data Marts among a Credential's consumers, as the Credentials page needs them. */
@Injectable()
export class CredentialSourceConsumersService implements OnModuleInit {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMarts: Repository<DataMart>,
    private readonly access: AccessDecisionService,
    private readonly consumerTitles: CredentialConsumerTitlesService
  ) {}

  onModuleInit(): void {
    this.consumerTitles.register(SOURCE_BINDING_CONSUMER_TYPE, (context, dataMartIds) =>
      this.visibleTitles(context, dataMartIds)
    );
  }

  /** Titles of the Data Marts the member can see, by Data Mart id; hidden ones are absent. */
  private async visibleTitles(
    context: AuthorizationContext,
    dataMartIds: readonly string[]
  ): Promise<ReadonlyMap<string, string>> {
    if (dataMartIds.length === 0) return new Map();
    const dataMarts = await this.dataMarts.find({
      where: { id: In([...new Set(dataMartIds)]), projectId: context.projectId },
      select: { id: true, title: true },
      loadEagerRelations: false,
    });
    if (dataMarts.length === 0) return new Map();
    const canSee = await this.access.canAccessMany(
      context.userId,
      context.roles ?? [],
      EntityType.DATA_MART,
      dataMarts.map(dataMart => dataMart.id),
      Action.SEE,
      context.projectId
    );
    return new Map(
      dataMarts
        .filter(dataMart => canSee.get(dataMart.id) === true)
        .map(dataMart => [dataMart.id, dataMart.title] as const)
    );
  }
}
