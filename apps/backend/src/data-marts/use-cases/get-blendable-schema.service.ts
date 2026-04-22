import { ForbiddenException, Injectable } from '@nestjs/common';
import { BlendableSchemaDto } from '../dto/domain/blendable-schema.dto';
import { GetBlendableSchemaCommand } from '../dto/domain/get-blendable-schema.command';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { BlendableSchemaService } from '../services/blendable-schema.service';

@Injectable()
export class GetBlendableSchemaService {
  constructor(
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetBlendableSchemaCommand): Promise<BlendableSchemaDto> {
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

    // computeBlendableSchema performs the project-scope check itself via getByIdAndProjectId.
    return this.blendableSchemaService.computeBlendableSchema(
      command.dataMartId,
      command.projectId
    );
  }
}
