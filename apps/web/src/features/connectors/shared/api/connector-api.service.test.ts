import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../../app/api/apiClient';
import { ConnectorApiService } from './connector-api.service';

vi.mock('../../../../app/api/apiClient', () => ({
  default: { post: vi.fn() },
}));

describe('ConnectorApiService.issuePickerToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("posts for the Credential's token and leaves the error toast to the caller", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { accessToken: 'token-1' } });

    await expect(
      new ConnectorApiService().issuePickerToken('GoogleSheets', 'cred-1')
    ).resolves.toEqual({ accessToken: 'token-1' });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/connectors/GoogleSheets/oauth/picker-token/cred-1',
      undefined,
      { skipErrorToast: true }
    );
  });

  it('passes the API refusal through unchanged', async () => {
    const refusal = {
      response: {
        status: 403,
        data: { message: 'Reconnect this Credential to add spreadsheets.' },
      },
    };
    vi.mocked(apiClient.post).mockRejectedValue(refusal);

    await expect(new ConnectorApiService().issuePickerToken('GoogleSheets', 'cred-1')).rejects.toBe(
      refusal
    );
  });
});
