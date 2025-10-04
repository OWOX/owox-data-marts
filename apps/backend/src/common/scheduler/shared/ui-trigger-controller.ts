import {
  BadRequestException,
  Delete,
  Get,
  HttpException,
  Logger,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Auth, AuthContext, AuthorizationContext, Role } from '../../../idp';
import { TriggerStatus } from './entities/trigger-status';
import { UiTrigger } from './entities/ui-trigger.entity';

/**
 * Abstract controller for managing UI triggers.
 *
 * This class provides methods to interact with and control the lifecycle
 * of UI triggers, including fetching their statuses, retrieving responses,
 * and aborting trigger runs. It is designed to operate with triggers specific
 * to a user and ensures secure access through role-based authentication.
 *
 * @template UiResponseType The type of the response payload associated with the UI trigger.
 */
export abstract class UiTriggerController<UiResponseType> {
  protected readonly logger: Logger;

  protected constructor(
    protected readonly triggerRepository: Repository<UiTrigger<UiResponseType>>
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  @Auth(Role.viewer())
  @Get('/:triggerId/status')
  public async getTriggerStatus(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<TriggerStatus> {
    this.logger.debug(`Checking trigger status for trigger ${triggerId}`);
    const trigger = await this.getTriggerByIdAndUserId(triggerId, context.userId);
    return trigger.status;
  }

  @Auth(Role.viewer())
  @Get('/:triggerId')
  public async getTriggerResponse(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<UiResponseType> {
    this.logger.debug(`Getting trigger response for trigger ${triggerId}`);
    const trigger = await this.getTriggerByIdAndUserId(triggerId, context.userId);

    if (trigger.status === TriggerStatus.SUCCESS) {
      const response = trigger.uiResponse;
      await this.triggerRepository.remove(trigger);
      return response;
    }

    if (trigger.status === TriggerStatus.ERROR) {
      const response = trigger.uiResponse;
      await this.triggerRepository.remove(trigger);
      throw new BadRequestException(response);
    }

    if (trigger.status === TriggerStatus.CANCELLED) {
      await this.triggerRepository.remove(trigger);
      throw new BadRequestException('Request was cancelled by user');
    }

    throw new HttpException('Trigger response is not ready', 408);
  }

  @Auth(Role.viewer())
  @Delete('/:triggerId')
  public async abortTriggerRun(
    @Param('triggerId') triggerId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<void> {
    this.logger.debug(`Aborting trigger run for trigger ${triggerId}`);
    const trigger = await this.getTriggerByIdAndUserId(triggerId, context.userId);

    if (trigger.status === TriggerStatus.IDLE) {
      await this.triggerRepository.remove(trigger);
    }

    if (trigger.status === TriggerStatus.PROCESSING || trigger.status === TriggerStatus.READY) {
      trigger.status = TriggerStatus.CANCELLING;
      await this.triggerRepository.save(trigger);
    }

    throw new BadRequestException("Request can't be cancelled at current state");
  }

  protected async getTriggerByIdAndUserId(
    id: string,
    userId: string
  ): Promise<UiTrigger<UiResponseType>> {
    const trigger = await this.triggerRepository.findOne({
      where: { id, userId },
    });

    if (!trigger) {
      throw new NotFoundException(`Trigger with id ${id} not found`);
    }

    return trigger;
  }
}
