import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectorState as ConnectorStateEntity } from '../../../entities/connector-state.entity';
import { ConnectorOutputState } from '../../interfaces/connector-output-state';
import { ConnectorState as State, ConnectorStateItem } from '../../interfaces/connector-state';

@Injectable()
export class ConnectorStateService {
  constructor(
    @InjectRepository(ConnectorStateEntity)
    private readonly connectorStateRepository: Repository<ConnectorStateEntity>
  ) {}

  /**
   * Get state for a specific configuration or the legacy single state
   * @param dataMartId - Data mart ID
   * @param configId - Optional configuration ID. If provided, returns state for that config
   * @returns State object or undefined
   */
  async getState(dataMartId: string, configId?: string): Promise<ConnectorStateItem | undefined> {
    const existingState = await this.connectorStateRepository.findOne({
      where: { datamartId: dataMartId },
    });

    if (!existingState?.state) {
      return undefined;
    }

    if (configId && existingState.state.states) {
      return existingState.state.states.find((s: ConnectorStateItem) => s._id === configId);
    }

    return undefined;
  }

  /**
   * Update state for a specific configuration
   * @param dataMartId - Data mart ID
   * @param configId - Configuration ID
   * @param outputState - State data to save
   */
  async updateState(
    dataMartId: string,
    configId: string,
    outputState: ConnectorOutputState
  ): Promise<void> {
    const existingState = await this.connectorStateRepository.findOne({
      where: { datamartId: dataMartId },
    });

    const now = new Date().toISOString();
    const newStateItem: ConnectorStateItem = {
      _id: configId,
      state: outputState.state || {},
      at: outputState.at || now,
    };

    if (existingState) {
      const currentStates = existingState.state?.states || [];

      const existingIndex = currentStates.findIndex((s: ConnectorStateItem) => s._id === configId);

      let updatedStates: ConnectorStateItem[];
      if (existingIndex >= 0) {
        updatedStates = [...currentStates];
        updatedStates[existingIndex] = newStateItem;
      } else {
        updatedStates = [...currentStates, newStateItem];
      }

      const stateToSave: State = {
        at: now,
        states: updatedStates,
      };

      await this.connectorStateRepository.save({
        ...existingState,
        state: stateToSave,
      });
    } else {
      const stateToSave: State = {
        at: now,
        states: [newStateItem],
      };

      await this.connectorStateRepository.save({
        datamartId: dataMartId,
        state: stateToSave,
      });
    }
  }
}
