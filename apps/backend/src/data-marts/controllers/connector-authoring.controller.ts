import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext } from '../../idp';
import { RejectApiKeyAuth, RejectPluginAuth } from '../../idp/decorators';
import { Role } from '../../idp/types/role-config.types';
import {
  ConnectorPreparationApiDto,
  ConnectorTestApprovalApiDto,
} from '../dto/presentation/connector-authoring-api.dto';
import { ConnectorAuthoringService } from '../use-cases/connector-authoring.service';

/** Preparation and test consent require an authenticated first-party application session. */
@Controller('connectors/custom')
@ApiTags('Custom Connectors')
@RejectApiKeyAuth()
@RejectPluginAuth()
export class ConnectorAuthoringController {
  constructor(private readonly authoring: ConnectorAuthoringService) {}

  private async safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Connector review could not be saved');
    }
  }

  @Auth(Role.editor())
  @Post(':id/authoring-preparation')
  prepare(
    @AuthContext() actor: AuthorizationContext,
    @Param('id') connectorId: string,
    @Body() body: ConnectorPreparationApiDto
  ) {
    return this.safe(() =>
      this.authoring.prepare({
        ...body,
        projectId: actor.projectId,
        userId: actor.userId,
        roles: actor.roles ?? [],
        connectorId,
      })
    );
  }

  @Auth(Role.editor())
  @Post(':id/test-approval')
  approveTest(
    @AuthContext() actor: AuthorizationContext,
    @Param('id') connectorId: string,
    @Body() body: ConnectorTestApprovalApiDto
  ) {
    return this.safe(() =>
      this.authoring.approveTest({
        ...body,
        projectId: actor.projectId,
        userId: actor.userId,
        roles: actor.roles ?? [],
        connectorId,
      })
    );
  }

  @Auth(Role.editor())
  @Delete(':id/authoring-preparations/:preparationId')
  revoke(
    @AuthContext() actor: AuthorizationContext,
    @Param('id') connectorId: string,
    @Param('preparationId') preparationId: string
  ) {
    return this.authoring.revoke(
      { projectId: actor.projectId, userId: actor.userId, roles: actor.roles ?? [] },
      preparationId,
      connectorId
    );
  }
}
