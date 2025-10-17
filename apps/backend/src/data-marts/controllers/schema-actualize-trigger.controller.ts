import { Controller, Post, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { SchemaActualizeTriggerService } from '../services/schema-actualize-trigger.service';
import { SchemaActualizeResponseApiDto } from '../dto/presentation/schema-actualize-response-api.dto';

@Controller('data-marts/:dataMartId/schema-actualize-triggers')
@ApiTags('DataMarts')
export class SchemaActualizeTriggerController extends UiTriggerController<SchemaActualizeResponseApiDto> {
  constructor(triggerService: SchemaActualizeTriggerService) {
    super(triggerService);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  async createTrigger(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string
  ): Promise<{ triggerId: string }> {
    const triggerId = await (this.triggerService as SchemaActualizeTriggerService).createTrigger(
      context.userId,
      context.projectId,
      dataMartId
    );
    return { triggerId };
  }
}
