import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ConnectorActionType, useConnectorContext } from '../context';
import { ConnectorApiService } from '../../api';
import { mapConnectorListFromDto } from '../mappers/connector-list.mapper';
import { trackEvent } from '../../../../../utils/data-layer';

export function useConnector() {
  const { state, dispatch } = useConnectorContext();
  const previewRequestIdRef = useRef(0);
  const previewAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      previewRequestIdRef.current += 1;
      previewAbortControllerRef.current?.abort();
    };
  }, []);

  const connectors = useMemo(() => {
    return mapConnectorListFromDto(state.connectors);
  }, [state.connectors]);

  const fetchAvailableConnectors = useCallback(async () => {
    dispatch({ type: ConnectorActionType.FETCH_CONNECTORS_START });
    try {
      const connectorApiService = new ConnectorApiService();
      const response = await connectorApiService.getAvailableConnectors();
      dispatch({ type: ConnectorActionType.FETCH_CONNECTORS_SUCCESS, payload: response });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      dispatch({
        type: ConnectorActionType.FETCH_CONNECTORS_ERROR,
        payload: message,
      });
      trackEvent({
        event: 'connector_error',
        category: 'Connector',
        action: 'ListError',
        label: message,
      });
    }
  }, [dispatch]);

  const fetchConnectorSpecification = useCallback(
    async (connectorName: string) => {
      dispatch({ type: ConnectorActionType.FETCH_CONNECTOR_SPECIFICATION_START });
      try {
        const connectorApiService = new ConnectorApiService();
        const response = await connectorApiService.getConnectorSpecification(connectorName);
        dispatch({
          type: ConnectorActionType.FETCH_CONNECTOR_SPECIFICATION_SUCCESS,
          payload: response,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        dispatch({
          type: ConnectorActionType.FETCH_CONNECTOR_SPECIFICATION_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'connector_error',
          category: 'Connector',
          action: 'SpecificationError',
          label: connectorName,
        });
      }
    },
    [dispatch]
  );

  const fetchConnectorFields = useCallback(
    async (connectorName: string) => {
      dispatch({ type: ConnectorActionType.FETCH_CONNECTOR_FIELDS_START });
      try {
        const connectorApiService = new ConnectorApiService();
        const response = await connectorApiService.getConnectorFields(connectorName);
        dispatch({ type: ConnectorActionType.FETCH_CONNECTOR_FIELDS_SUCCESS, payload: response });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        dispatch({
          type: ConnectorActionType.FETCH_CONNECTOR_FIELDS_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'connector_error',
          category: 'Connector',
          action: 'FieldsError',
          label: connectorName,
        });
      }
    },
    [dispatch]
  );

  const previewGoogleSheetsFields = useCallback(
    async (configuration: Record<string, unknown>) => {
      const requestId = previewRequestIdRef.current + 1;
      previewRequestIdRef.current = requestId;
      previewAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      previewAbortControllerRef.current = abortController;

      dispatch({ type: ConnectorActionType.FETCH_CONNECTOR_FIELDS_START });
      try {
        const connectorApiService = new ConnectorApiService();
        const response = await connectorApiService.previewGoogleSheetsFields(configuration, {
          signal: abortController.signal,
        });

        if (requestId !== previewRequestIdRef.current) return null;

        dispatch({ type: ConnectorActionType.FETCH_CONNECTOR_FIELDS_SUCCESS, payload: response });
        return response;
      } catch (error) {
        if (requestId !== previewRequestIdRef.current || abortController.signal.aborted) {
          return null;
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        dispatch({
          type: ConnectorActionType.FETCH_CONNECTOR_FIELDS_ERROR,
          payload: message,
        });
        throw error;
      } finally {
        if (requestId === previewRequestIdRef.current) {
          previewAbortControllerRef.current = null;
        }
      }
    },
    [dispatch]
  );

  return {
    connectors,
    connectorSpecification: state.connectorSpecification,
    connectorFields: state.connectorFields,
    loading: state.loading,
    loadingSpecification: state.loadingSpecification,
    loadingFields: state.loadingFields,
    error: state.error,
    fetchAvailableConnectors,
    fetchConnectorSpecification,
    fetchConnectorFields,
    previewGoogleSheetsFields,
  };
}
