import type {
  ConnectorDefinitionDto,
  ConnectorSpecificationResponseApiDto,
  ConnectorFieldsResponseApiDto,
} from '../../api/types';
import type { ConnectorState } from './reducer';

export enum ConnectorActionType {
  FETCH_CONNECTORS_START = 'FETCH_CONNECTORS_START',
  FETCH_CONNECTORS_SUCCESS = 'FETCH_CONNECTORS_SUCCESS',
  FETCH_CONNECTORS_ERROR = 'FETCH_CONNECTORS_ERROR',
  FETCH_CONNECTOR_SPECIFICATION_START = 'FETCH_CONNECTOR_SPECIFICATION_START',
  FETCH_CONNECTOR_SPECIFICATION_SUCCESS = 'FETCH_CONNECTOR_SPECIFICATION_SUCCESS',
  FETCH_CONNECTOR_SPECIFICATION_ERROR = 'FETCH_CONNECTOR_SPECIFICATION_ERROR',
  FETCH_CONNECTOR_FIELDS_START = 'FETCH_CONNECTOR_FIELDS_START',
  FETCH_CONNECTOR_FIELDS_SUCCESS = 'FETCH_CONNECTOR_FIELDS_SUCCESS',
  FETCH_CONNECTOR_FIELDS_ERROR = 'FETCH_CONNECTOR_FIELDS_ERROR',
}

export type ConnectorAction =
  | { type: ConnectorActionType.FETCH_CONNECTORS_START }
  | { type: ConnectorActionType.FETCH_CONNECTORS_SUCCESS; payload: ConnectorDefinitionDto[] }
  | { type: ConnectorActionType.FETCH_CONNECTORS_ERROR; payload: string }
  | { type: ConnectorActionType.FETCH_CONNECTOR_SPECIFICATION_START }
  | {
      type: ConnectorActionType.FETCH_CONNECTOR_SPECIFICATION_SUCCESS;
      payload: ConnectorSpecificationResponseApiDto[];
    }
  | { type: ConnectorActionType.FETCH_CONNECTOR_SPECIFICATION_ERROR; payload: string }
  | { type: ConnectorActionType.FETCH_CONNECTOR_FIELDS_START }
  | {
      type: ConnectorActionType.FETCH_CONNECTOR_FIELDS_SUCCESS;
      payload: ConnectorFieldsResponseApiDto[];
    }
  | { type: ConnectorActionType.FETCH_CONNECTOR_FIELDS_ERROR; payload: string };

export interface ConnectorContextValue {
  state: ConnectorState;
  dispatch: React.Dispatch<ConnectorAction>;
}
