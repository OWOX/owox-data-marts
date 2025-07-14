import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectorState as ConnectorStateEntity } from '../../../entities/connector-state.entity';
import { ConnectorOutputState } from '../../interfaces/connector-output-state';
import { ConnectorState as State } from '../../interfaces/connector-state';

@Injectable()
export class ConnectorStateService {
  constructor(
    @InjectRepository(ConnectorStateEntity)
    private readonly connectorStateRepository: Repository<ConnectorStateEntity>
  ) {}

  async getState(dataMartId: string): Promise<State | undefined> {
    const existingState = await this.connectorStateRepository.findOne({
      where: { datamartId: dataMartId },
    });
    return existingState?.state;
  }

  async updateState(dataMartId: string, outputState: ConnectorOutputState): Promise<void> {
    const existingState = await this.connectorStateRepository.findOne({
      where: { datamartId: dataMartId },
    });

    const stateToSave: State = {
      state: outputState.state,
      at: outputState.at,
    };

    if (existingState) {
      await this.connectorStateRepository.save({
        ...existingState,
        state: stateToSave,
      });
    } else {
      await this.connectorStateRepository.save({
        datamartId: dataMartId,
        state: stateToSave,
      });
    }
  }
}
