// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyGooglePickerAccount } from './useGoogleDrivePicker';

describe('verifyGooglePickerAccount', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts the same Google account case-insensitively', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'Analyst@Example.com' }), { status: 200 })
    );

    await expect(
      verifyGooglePickerAccount('access-token', 'analyst@example.com')
    ).resolves.toBeUndefined();
  });

  it('rejects a Picker token issued for a different Google account', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'other@example.com' }), { status: 200 })
    );

    await expect(verifyGooglePickerAccount('access-token', 'analyst@example.com')).rejects.toThrow(
      'Open Google Picker with the connected account analyst@example.com'
    );
  });
});
