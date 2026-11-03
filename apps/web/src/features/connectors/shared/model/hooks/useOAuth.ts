import { useRef, useCallback } from 'react';
import { extractApiError } from '../../../../../app/api';
import { ConnectorApiService } from '../../api';
import type { OAuthExchangeCredentialTarget } from '../../api/types/request';
import type { OAuthStatusResponseDto, OAuthSettingsResponseDto } from '../../api/types/response';

export function useOAuth() {
  const apiService = useRef(new ConnectorApiService());

  const exchangeCredentials = useCallback(
    async (
      connectorName: string,
      payload: Record<string, unknown>,
      fieldPath: string,
      credential?: OAuthExchangeCredentialTarget
    ) => {
      return await apiService.current.exchangeCredentials(connectorName, {
        fieldPath,
        payload,
        credential,
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

  const getPickerToken = useCallback(
    async (connectorName: string, credentialId: string): Promise<string> => {
      try {
        const { accessToken } = await apiService.current.issuePickerToken(
          connectorName,
          credentialId
        );
        return accessToken;
      } catch (e) {
        throw new Error(extractApiError(e).message ?? 'Could not get a Google token for Picker');
      }
    },
    []
  );

  return {
    exchangeCredentials,
    getPickerToken,
    checkStatus,
    getSettings,
  };
}
