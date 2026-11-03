import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorApiService } from '../../api';
import { useOAuth } from './useOAuth';

const REFUSAL = 'You need edit access to this Credential to add spreadsheets.';

describe('useOAuth.getPickerToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves to the issued token', async () => {
    const issue = vi
      .spyOn(ConnectorApiService.prototype, 'issuePickerToken')
      .mockResolvedValue({ accessToken: 'token-1' });
    const { result } = renderHook(() => useOAuth());

    await expect(result.current.getPickerToken('GoogleSheets', 'cred-1')).resolves.toBe('token-1');
    expect(issue).toHaveBeenCalledWith('GoogleSheets', 'cred-1');
  });

  it("rejects with the API's refusal", async () => {
    vi.spyOn(ConnectorApiService.prototype, 'issuePickerToken').mockRejectedValue({
      response: { status: 403, data: { message: REFUSAL } },
    });
    const { result } = renderHook(() => useOAuth());

    await expect(result.current.getPickerToken('GoogleSheets', 'cred-1')).rejects.toThrow(REFUSAL);
  });

  it('rejects with a fallback when the API names no reason', async () => {
    vi.spyOn(ConnectorApiService.prototype, 'issuePickerToken').mockRejectedValue(
      new Error('Network Error')
    );
    const { result } = renderHook(() => useOAuth());

    await expect(result.current.getPickerToken('GoogleSheets', 'cred-1')).rejects.toThrow(
      'Could not get a Google token for Picker'
    );
  });
});
