import { useRef, useCallback } from 'react';
import { ConnectorApiService } from '../../api';
import type { OAuthStatusResponseDto, OAuthSettingsResponseDto } from '../../api/types/response';

export function useOAuth() {
  const apiService = useRef(new ConnectorApiService());

  const exchangeCredentials = useCallback(
    async (connectorName: string, payload: Record<string, unknown>, fieldPath: string) => {
      return await apiService.current.exchangeCredentials(connectorName, {
        fieldPath,
        payload,
      });
    },
    []
  );

  const checkStatus = useCallback(
    async (connectorName: string, credentialId: string): Promise<OAuthStatusResponseDto> => {
      try {
        const status = await apiService.current.checkOAuthStatus(connectorName, credentialId);
        return status;
      } catch {
        return {
          valid: false,
        };
      }
    },
    []
  );

  const getSettings = useCallback(
    async (connectorName: string, path: string): Promise<OAuthSettingsResponseDto> => {
      return await apiService.current.getOAuthSettings(connectorName, path);
    },
    []
  );

  return {
    exchangeCredentials,
    checkStatus,
    getSettings,
  };
}
