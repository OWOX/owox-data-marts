import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { ConnectorBuilderApiService } from '../../../connector-builder/shared/api/connector-builder-api.service';
import type { CustomConnectorListItemDto } from '../../../connector-builder/shared/api/types';
import { apiErrorMessage } from '../../../../app/api/extract-api-error.util';

export function useConnectorsList(): {
  connectors: CustomConnectorListItemDto[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteConnector: (id: string) => Promise<void>;
} {
  const [connectors, setConnectors] = useState<CustomConnectorListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await new ConnectorBuilderApiService().list();
      setConnectors(items);
    } catch (e) {
      setError(apiErrorMessage(e, 'Failed to load connectors'));
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteConnector = useCallback(
    async (id: string) => {
      try {
        await new ConnectorBuilderApiService().softDelete(id);
        toast.success('Connector deleted');
        await refetch();
      } catch (e) {
        toast.error(apiErrorMessage(e, 'Failed to delete connector'));
      }
    },
    [refetch]
  );

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { connectors, loading, error, refetch, deleteConnector };
}
