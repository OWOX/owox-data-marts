import { Delete, Get, Logger, Param } from '@nestjs/common';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../../idp';
import { TriggerStatus } from './entities/trigger-status';
import { UiTriggerService } from './ui-trigger.service';

/**
 * Abstract controller for managing UI triggers.
 *
 * This class provides HTTP endpoints for UI trigger operations
 * and delegates business logic to UiTriggerService.
 *
 * @template UiResponseType The type of the response payload associated with the UI trigger.
 */
export abstract class UiTriggerController<UiResponseType> {
  protected readonly logger: Logger;

  protected constructor(protected readonly triggerService: UiTriggerService<UiResponseType>) {
    this.logger = new Logger(this.constructor.name);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('/:triggerId/status')
  public async getTriggerStatus(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<{ status: TriggerStatus }> {
    const status = await this.triggerService.getTriggerStatus(triggerId, context.userId);
    return { status };
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('/:triggerId')
  public async getTriggerResponse(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<UiResponseType> {
    return this.triggerService.getTriggerResponse(triggerId, context.userId);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Delete('/:triggerId')
  public async abortTriggerRun(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<void> {
    return this.triggerService.abortTriggerRun(triggerId, context.userId);
  }
}
