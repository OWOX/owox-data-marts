import { useEffect, useMemo, useState } from 'react';
import type { AxiosRequestConfig } from '../../app/api';
import type { ConnectorListItem } from '../connectors/shared/model/types/connector';
import { loadCustomConnectors } from '../connectors/shared/utils';
import type { DataMartListItemResponseDto } from '../data-marts/shared';
import { dataMartService } from '../data-marts/shared/services/data-mart.service';
import type { Credential } from './types';

const SILENT: AxiosRequestConfig = { skipErrorToast: true, skipLoadingIndicator: true };

interface LoadedLists {
  dataMarts: DataMartListItemResponseDto[];
  connectors: ConnectorListItem[];
}

function dataMartIds(credential: Credential): string[] {
  return credential.usedBy
    .filter(consumer => consumer.consumerType === 'connector-config')
    .map(consumer => consumer.consumerId);
}

export function customConnectorOf(
  credential: Credential,
  connectorByDataMartId: ReadonlyMap<string, string>
): string | null {
  const names = new Set(dataMartIds(credential).flatMap(id => connectorByDataMartId.get(id) ?? []));
  return names.size === 1 ? [...names][0] : null;
}

export function useCustomConnectorLogos(
  credentials: readonly Credential[]
): ReadonlyMap<string, string | null> {
  const key = useMemo(
    () =>
      credentials
        .filter(credential => credential.definition.auth?.type === 'custom-connector')
        .map(credential => [credential.id, ...dataMartIds(credential).sort()])
        .filter(ids => ids.length > 1)
        .map(ids => ids.join(','))
        .join(';'),
    [credentials]
  );
  const [keyed, setKeyed] = useState({ key, credentials });
  if (keyed.key !== key) setKeyed({ key, credentials });
  const [lists, setLists] = useState<LoadedLists | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void Promise.all([dataMartService.getDataMarts(SILENT), loadCustomConnectors(SILENT)])
      .then(([dataMarts, connectors]) => ({ dataMarts, connectors }))
      .catch(() => ({ dataMarts: [], connectors: [] }))
      .then(loaded => {
        if (!cancelled) setLists(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(() => {
    const logos = new Map<string, string | null>();
    if (!keyed.key || !lists) return logos;
    const connectorByDataMartId = new Map(
      lists.dataMarts.flatMap(dataMart =>
        dataMart.connectorSourceName != null
          ? [[dataMart.id, dataMart.connectorSourceName] as const]
          : []
      )
    );
    for (const credential of keyed.credentials) {
      if (credential.definition.auth?.type !== 'custom-connector') continue;
      const name = customConnectorOf(credential, connectorByDataMartId);
      logos.set(
        credential.id,
        lists.connectors.find(connector => connector.name === name)?.logoBase64 ?? null
      );
    }
    return logos;
  }, [keyed, lists]);
}
