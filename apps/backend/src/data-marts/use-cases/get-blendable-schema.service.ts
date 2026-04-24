import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { BlendableSchemaDto } from '../dto/domain/blendable-schema.dto';
import { GetBlendableSchemaCommand } from '../dto/domain/get-blendable-schema.command';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { BlendableSchemaService } from '../services/blendable-schema.service';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class GetBlendableSchemaService {
  constructor(
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetBlendableSchemaCommand): Promise<BlendableSchemaDto> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    await this.dataMartService.getByIdAndProjectId(command.dataMartId, command.projectId);

    const canSee = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      command.dataMartId,
      Action.SEE,
      command.projectId
    );
    if (!canSee) {
      throw new ForbiddenException('You do not have access to this DataMart');
    }

    return this.blendableSchemaService.computeBlendableSchema(
      command.dataMartId,
      command.projectId
    );
  }
}
