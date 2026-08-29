import { describe, expect, it } from 'vitest';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTriggerResponseApiDto } from '../api';
import type { ScheduledTrigger } from '../scheduled-trigger.model';
import { DataQualityRunTriggerMapper } from './data-quality-run-trigger.mapper';

describe('DataQualityRunTriggerMapper', () => {
  const dto = {
    id: 'schedule-1',
    type: 'DATA_QUALITY_RUN',
    cronExpression: '0 9 * * *',
    timeZone: 'UTC',
    isActive: true,
    nextRunTimestamp: '2026-07-29T09:00:00.000Z',
    lastRunTimestamp: null,
    triggerConfig: null,
    createdById: 'user-1',
    createdAt: '2026-07-28T09:00:00.000Z',
    modifiedAt: '2026-07-28T09:00:00.000Z',
    createdByUser: null,
  } as ScheduledTriggerResponseApiDto;

  it('maps a config-less Data Quality schedule from the API', () => {
    const mapper = new DataQualityRunTriggerMapper();

    expect(mapper.mapFromDto(dto)).toEqual({
      id: 'schedule-1',
      type: ScheduledTriggerType.DATA_QUALITY_RUN,
      cronExpression: '0 9 * * *',
      timeZone: 'UTC',
      isActive: true,
      nextRun: new Date('2026-07-29T09:00:00.000Z'),
      lastRun: null,
      triggerConfig: null,
      createdById: 'user-1',
      createdAt: new Date('2026-07-28T09:00:00.000Z'),
      modifiedAt: new Date('2026-07-28T09:00:00.000Z'),
      createdByUser: null,
    });
  });

  it('creates a config-less DATA_QUALITY_RUN request', () => {
    const mapper = new DataQualityRunTriggerMapper();
    const model: ScheduledTrigger = mapper.mapFromDto(dto);

    expect(mapper.mapToCreateRequest(model)).toEqual({
      type: ScheduledTriggerType.DATA_QUALITY_RUN,
      cronExpression: '0 9 * * *',
      timeZone: 'UTC',
      isActive: true,
      triggerConfig: null,
    });
  });
});
