import { describe, expect, it } from 'vitest';
import type { ScheduledTrigger } from '../scheduled-trigger.model';
import { initialState, scheduledTriggerReducer } from './scheduled-trigger-reducer';

const trigger = { id: 't1' } as ScheduledTrigger;

describe('scheduledTriggerReducer hasLoaded', () => {
  it('stays false when a create succeeds after a failed list fetch', () => {
    let state = scheduledTriggerReducer(initialState, { type: 'FETCH_TRIGGERS_START' });
    state = scheduledTriggerReducer(state, { type: 'FETCH_TRIGGERS_ERROR', payload: 'failed' });
    state = scheduledTriggerReducer(state, { type: 'CREATE_TRIGGER_START' });
    state = scheduledTriggerReducer(state, { type: 'CREATE_TRIGGER_SUCCESS', payload: trigger });

    expect(state.hasLoaded).toBe(false);
  });

  it('turns true on a list fetch success, survives a refetch and clears on reset', () => {
    let state = scheduledTriggerReducer(initialState, {
      type: 'FETCH_TRIGGERS_SUCCESS',
      payload: [trigger],
    });
    expect(state.hasLoaded).toBe(true);

    state = scheduledTriggerReducer(state, { type: 'FETCH_TRIGGERS_START' });
    state = scheduledTriggerReducer(state, { type: 'FETCH_TRIGGERS_ERROR', payload: 'failed' });
    expect(state.hasLoaded).toBe(true);

    expect(scheduledTriggerReducer(state, { type: 'RESET' }).hasLoaded).toBe(false);
  });
});
