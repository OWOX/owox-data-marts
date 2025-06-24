import type {
  ConnectorDefinitionDto,
  ConnectorSpecificationResponseApiDto,
  ConnectorFieldsResponseApiDto,
} from '../../../api/types/response';
import { ConnectorActionType, type ConnectorAction } from './types';

export interface ConnectorState {
  connectors: ConnectorDefinitionDto[];
  connectorSpecification: ConnectorSpecificationResponseApiDto[] | null;
  connectorFields: ConnectorFieldsResponseApiDto[] | null;
  loading: boolean;
  loadingSpecification: boolean;
  loadingFields: boolean;
  error: string | null;
}

export const initialConnectorState: ConnectorState = {
  connectors: [],
  connectorSpecification: null,
  connectorFields: null,
  loading: false,
  loadingSpecification: false,
  loadingFields: false,
  error: null,
};

export function reducer(state: ConnectorState, action: ConnectorAction): ConnectorState {
  switch (action.type) {
    case ConnectorActionType.FETCH_CONNECTORS_START:
      return { ...state, loading: true, error: null };
    case ConnectorActionType.FETCH_CONNECTORS_SUCCESS:
      return { ...state, connectors: action.payload, loading: false, error: null };
    case ConnectorActionType.FETCH_CONNECTORS_ERROR:
      return { ...state, loading: false, error: action.payload };
    case ConnectorActionType.FETCH_CONNECTOR_SPECIFICATION_START:
      return { ...state, loadingSpecification: true, error: null };
    case ConnectorActionType.FETCH_CONNECTOR_SPECIFICATION_SUCCESS:
      return {
        ...state,
        connectorSpecification: action.payload,
        loadingSpecification: false,
        error: null,
      };
    case ConnectorActionType.FETCH_CONNECTOR_SPECIFICATION_ERROR:
      return { ...state, loadingSpecification: false, error: action.payload };
    case ConnectorActionType.FETCH_CONNECTOR_FIELDS_START:
      return { ...state, loadingFields: true, error: null };
    case ConnectorActionType.FETCH_CONNECTOR_FIELDS_SUCCESS:
      return { ...state, connectorFields: action.payload, loadingFields: false, error: null };
    case ConnectorActionType.FETCH_CONNECTOR_FIELDS_ERROR:
      return { ...state, loadingFields: false, error: action.payload };
    default:
      return state;
  }
}
