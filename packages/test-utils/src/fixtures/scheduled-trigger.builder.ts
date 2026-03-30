import { ScheduledTriggerType } from '../../../../apps/backend/src/data-marts/scheduled-trigger-types/enums/scheduled-trigger-type.enum';

export interface ScheduledTriggerCreatePayload {
  type: ScheduledTriggerType;
  cronExpression: string;
  timeZone: string;
  isActive?: boolean;
  triggerConfig?: Record<string, unknown>;
}

export class ScheduledTriggerBuilder {
  private payload: ScheduledTriggerCreatePayload = {
    type: ScheduledTriggerType.CONNECTOR_RUN,
    cronExpression: '0 * * * *',
    timeZone: 'UTC',
  };

  withType(type: ScheduledTriggerType): this {
    this.payload.type = type;
    return this;
  }

  withCronExpression(cron: string): this {
    this.payload.cronExpression = cron;
    return this;
  }

  withTimeZone(tz: string): this {
    this.payload.timeZone = tz;
    return this;
  }

  withIsActive(isActive: boolean): this {
    this.payload.isActive = isActive;
    return this;
  }

  withTriggerConfig(config: Record<string, unknown>): this {
    this.payload.triggerConfig = config;
    return this;
  }

  build(): ScheduledTriggerCreatePayload {
    return { ...this.payload };
  }
}
