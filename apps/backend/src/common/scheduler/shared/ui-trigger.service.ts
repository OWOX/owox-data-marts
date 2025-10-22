import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { TriggerStatus } from './entities/trigger-status';
import { UiTrigger } from './entities/ui-trigger.entity';

/**
 * Abstract service for managing UI triggers business logic.
 *
 * This class encapsulates all business logic related to UI triggers,
 * including fetching, status management, and lifecycle operations.
 *
 * @template UiResponseType The type of the response payload associated with the UI trigger.
 */
@Injectable()
export abstract class UiTriggerService<UiResponseType> {
  protected readonly logger: Logger;

  protected constructor(
    protected readonly triggerRepository: Repository<UiTrigger<UiResponseType>>
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Get trigger status by ID and user ID
   */
  async getTriggerStatus(triggerId: string, userId: string): Promise<TriggerStatus> {
    this.logger.debug(`Checking trigger status for trigger ${triggerId}`);
    const trigger = await this.getTriggerByIdAndUserId(triggerId, userId);
    return trigger.status;
  }

  /**
   * Get trigger response and handle different status cases
   */
  async getTriggerResponse(triggerId: string, userId: string): Promise<UiResponseType> {
    this.logger.debug(`Getting trigger response for trigger ${triggerId}`);
    const trigger = await this.getTriggerByIdAndUserId(triggerId, userId);

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

  /**
   * Abort trigger run
   */
  async abortTriggerRun(triggerId: string, userId: string): Promise<void> {
    this.logger.debug(`Aborting trigger run for trigger ${triggerId}`);
    const trigger = await this.getTriggerByIdAndUserId(triggerId, userId);

    if (trigger.status === TriggerStatus.IDLE) {
      await this.triggerRepository.remove(trigger);
      return;
    }

    if (trigger.status === TriggerStatus.PROCESSING || trigger.status === TriggerStatus.READY) {
      trigger.status = TriggerStatus.CANCELLING;
      await this.triggerRepository.save(trigger);
      return;
    }

    if (trigger.status === TriggerStatus.SUCCESS) {
      this.logger.debug(
        `Trigger ${triggerId} already in final state ${trigger.status}, removing it`
      );
      await this.triggerRepository.remove(trigger);
      return;
    }

    throw new BadRequestException("Request can't be cancelled at current state");
  }

  /**
   * Get trigger by ID and user ID with validation
   */
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
