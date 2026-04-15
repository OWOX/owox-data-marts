import { Controller, Post, Body, Param, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { SqlDryRunTriggerService } from '../services/sql-dry-run-trigger.service';
import { SqlDryRunResponseApiDto } from '../dto/presentation/sql-dry-run-response-api.dto';
import { SqlDryRunRequestApiDto } from '../dto/presentation/sql-dry-run-request-api.dto';
import { CreateSqlDryRunTriggerSpec } from './spec/sql-dry-run-trigger.api';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

/**
 * Controller for SQL dry run triggers.
 * Provides endpoints for creating, checking status, retrieving results, and cancelling SQL validation triggers.
 *
 * Inherited endpoints from UiTriggerController:
 * - GET /:triggerId/status - Get trigger status
 * - GET /:triggerId - Get trigger response (result)
 * - DELETE /:triggerId - Cancel/abort trigger
 */
@Controller('data-marts/:dataMartId/sql-dry-run-triggers')
@ApiTags('DataMarts')
export class SqlDryRunTriggerController extends UiTriggerController<SqlDryRunResponseApiDto> {
  constructor(
    triggerService: SqlDryRunTriggerService,
    private readonly accessDecisionService: AccessDecisionService
  ) {
    super(triggerService);
  }

  /**
   * Create a new SQL dry run trigger
   *
   * @param context - Authorization context with user and project information
   * @param dataMartId - ID of the data mart
   * @param dto - Request body containing the SQL query to validate
   * @returns Object with the created trigger ID
   */
  @CreateSqlDryRunTriggerSpec()
  @Auth(Role.viewer(Strategy.PARSE))
  @Post()
  async createSqlDryRunTrigger(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: SqlDryRunRequestApiDto
  ): Promise<{ triggerId: string }> {
    if (context.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.DATA_MART,
        dataMartId,
        Action.EDIT,
        context.projectId
      );
      if (!canEdit) throw new ForbiddenException('You do not have access to this DataMart');
    }
    const triggerId = await (this.triggerService as SqlDryRunTriggerService).createTrigger(
      context.userId,
      context.projectId,
      dataMartId,
      dto.sql
    );

    return { triggerId };
  }
}
