import { Body, Controller, Delete, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { UiTriggerController } from '../../common/scheduler/shared/ui-trigger-controller';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { SqlDryRunTriggerService } from '../services/sql-dry-run-trigger.service';
import { SqlDryRunResponseApiDto } from '../dto/presentation/sql-dry-run-response-api.dto';
import { SqlDryRunRequestApiDto } from '../dto/presentation/sql-dry-run-request-api.dto';
import {
  CancelSqlDryRunTriggerSpec,
  CreateSqlDryRunTriggerSpec,
  GetSqlDryRunTriggerResponseSpec,
  GetSqlDryRunTriggerStatusSpec,
} from './spec/sql-dry-run-trigger.api';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

/**
 * Controller for SQL dry run triggers.
 * Provides endpoints for creating, checking status, retrieving results, and cancelling SQL validation triggers.
 *
 * Lifecycle endpoints delegated to UiTriggerController:
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
      if (!canEdit)
        throw new ForbiddenException('You do not have permission to edit this DataMart');
    }
    const triggerId = await (this.triggerService as SqlDryRunTriggerService).createTrigger(
      context.userId,
      context.projectId,
      dataMartId,
      dto.sql
    );

    return { triggerId };
  }

  @GetSqlDryRunTriggerStatusSpec()
  @Auth(Role.viewer(Strategy.PARSE))
  @Get('/:triggerId/status')
  public override async getTriggerStatus(
    @Param('triggerId') triggerId: string
  ): Promise<{ status: TriggerStatus }> {
    return super.getTriggerStatus(triggerId);
  }

  @GetSqlDryRunTriggerResponseSpec()
  @Auth(Role.viewer(Strategy.PARSE))
  @Get('/:triggerId')
  public override async getTriggerResponse(
    @Param('triggerId') triggerId: string
  ): Promise<SqlDryRunResponseApiDto> {
    return super.getTriggerResponse(triggerId);
  }

  @CancelSqlDryRunTriggerSpec()
  @Auth(Role.viewer(Strategy.PARSE))
  @Delete('/:triggerId')
  public override async abortTriggerRun(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<void> {
    return super.abortTriggerRun(triggerId, context);
  }
}
