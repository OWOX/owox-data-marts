import React, { useCallback, useReducer } from 'react';
import { ScheduledTriggerContext } from './scheduled-trigger-context';
import { initialState, scheduledTriggerReducer } from './scheduled-trigger-reducer';
import { scheduledTriggerService } from '../../services';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTrigger } from '../scheduled-trigger.model';
import { ScheduledTriggerMapper } from '../mappers';
import type { ScheduledTriggerConfig } from '../trigger-config.types.ts';
import { useDataMartContext } from '../../../edit/model';
import { useConnector } from '../../../../connectors/shared/model/hooks/useConnector.ts';
import { toast } from 'react-hot-toast';

interface ScheduledTriggerProviderProps {
  children: React.ReactNode;
}

export function ScheduledTriggerProvider({ children }: ScheduledTriggerProviderProps) {
  const [state, dispatch] = useReducer(scheduledTriggerReducer, initialState);
  const { dataMart } = useDataMartContext();
  const { fetchAvailableConnectors } = useConnector();

  if (!dataMart) {
    throw new Error('Trigger provider must be used within a data mart context');
  }

  const getScheduledTriggers = useCallback(
    async (dataMartId: string) => {
      await fetchAvailableConnectors();
      dispatch({ type: 'FETCH_TRIGGERS_START' });
      try {
        const triggersDto = await scheduledTriggerService.getScheduledTriggers(dataMartId);
        const triggers = await ScheduledTriggerMapper.mapFromDtoListWithReportData(
          triggersDto,
          dataMart
        );
        dispatch({ type: 'FETCH_TRIGGERS_SUCCESS', payload: triggers });
      } catch (error) {
        dispatch({
          type: 'FETCH_TRIGGERS_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to fetch scheduled triggers',
        });
      }
    },
    [dataMart, fetchAvailableConnectors]
  );

  const getScheduledTriggersByType = useCallback(
    async (dataMartId: string, triggerType: ScheduledTriggerType) => {
      dispatch({ type: 'FETCH_TRIGGERS_START' });
      try {
        const triggersDto = await scheduledTriggerService.getScheduledTriggers(dataMartId);
        const filteredTriggersDto = triggersDto.filter(trigger => trigger.type === triggerType);
        const triggers = await ScheduledTriggerMapper.mapFromDtoListWithReportData(
          filteredTriggersDto,
          dataMart
        );
        dispatch({ type: 'FETCH_TRIGGERS_SUCCESS', payload: triggers });
      } catch (error) {
        dispatch({
          type: 'FETCH_TRIGGERS_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to fetch scheduled triggers',
        });
      }
    },
    [dataMart]
  );

  const getScheduledTrigger = useCallback(
    async (dataMartId: string, id: string) => {
      dispatch({ type: 'FETCH_TRIGGER_START' });
      try {
        const triggerDto = await scheduledTriggerService.getScheduledTrigger(dataMartId, id);
        const trigger = await ScheduledTriggerMapper.mapFromDtoWithReportData(triggerDto, dataMart);
        dispatch({ type: 'FETCH_TRIGGER_SUCCESS', payload: trigger });
      } catch (error) {
        dispatch({
          type: 'FETCH_TRIGGER_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to fetch scheduled trigger',
        });
      }
    },
    [dataMart]
  );

  const createScheduledTrigger = useCallback(
    async (
      dataMartId: string,
      type: ScheduledTriggerType,
      cronExpression: string,
      timeZone: string,
      isActive: boolean,
      triggerConfig: ScheduledTriggerConfig
    ) => {
      dispatch({ type: 'CREATE_TRIGGER_START' });
      try {
        const requestDto = {
          type,
          cronExpression,
          timeZone,
          isActive,
          triggerConfig,
        };
        const triggerDto = await scheduledTriggerService.createScheduledTrigger(
          dataMartId,
          requestDto
        );
        const trigger = await ScheduledTriggerMapper.mapFromDtoWithReportData(triggerDto, dataMart);
        dispatch({ type: 'CREATE_TRIGGER_SUCCESS', payload: trigger });
        toast.success('Trigger created');
        return trigger;
      } catch (error) {
        dispatch({
          type: 'CREATE_TRIGGER_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to create scheduled trigger',
        });
        throw error;
      }
    },
    [dataMart]
  );

  const updateScheduledTrigger = useCallback(
    async (
      dataMartId: string,
      id: string,
      cronExpression: string,
      timeZone: string,
      isActive: boolean
    ) => {
      dispatch({ type: 'UPDATE_TRIGGER_START' });
      try {
        const requestDto = {
          cronExpression,
          timeZone,
          isActive,
        };
        const triggerDto = await scheduledTriggerService.updateScheduledTrigger(
          dataMartId,
          id,
          requestDto
        );
        const trigger = await ScheduledTriggerMapper.mapFromDtoWithReportData(triggerDto, dataMart);
        dispatch({ type: 'UPDATE_TRIGGER_SUCCESS', payload: trigger });
        toast.success('Trigger updated');
      } catch (error) {
        dispatch({
          type: 'UPDATE_TRIGGER_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to update scheduled trigger',
        });
        throw error;
      }
    },
    [dataMart]
  );

  const deleteScheduledTrigger = useCallback(async (dataMartId: string, id: string) => {
    dispatch({ type: 'DELETE_TRIGGER_START' });
    try {
      await scheduledTriggerService.deleteScheduledTrigger(dataMartId, id);
      dispatch({ type: 'DELETE_TRIGGER_SUCCESS', payload: id });
      toast.success('Trigger deleted');
    } catch (error) {
      dispatch({
        type: 'DELETE_TRIGGER_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to delete scheduled trigger',
      });
      throw error;
    }
  }, []);

  const selectScheduledTrigger = useCallback((trigger: ScheduledTrigger | null) => {
    dispatch({ type: 'SELECT_TRIGGER', payload: trigger });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return (
    <ScheduledTriggerContext.Provider
      value={{
        ...state,
        getScheduledTriggers,
        getScheduledTriggersByType,
        getScheduledTrigger,
        createScheduledTrigger,
        updateScheduledTrigger,
        deleteScheduledTrigger,
        selectScheduledTrigger,
        reset,
      }}
    >
      {children}
    </ScheduledTriggerContext.Provider>
  );
}
