import { describe, expect, it } from '@jest/globals';
import { ExtensionAuthRequestSchema } from './extension-auth-request.dto.js';

describe('extension auth request schemas', () => {
  it('accepts Microsoft assertion with an optional explicit project', () => {
    expect(
      ExtensionAuthRequestSchema.parse({
        assertion_type: 'ms_entra_access_token',
        assertion: 'signed-assertion',
        project_id: 'project_1',
      })
    ).toEqual({
      assertion_type: 'ms_entra_access_token',
      assertion: 'signed-assertion',
      project_id: 'project_1',
    });
  });

  it('keeps assertion and identity refresh modes mutually exclusive', () => {
    expect(() =>
      ExtensionAuthRequestSchema.parse({
        assertion_type: 'ms_entra_access_token',
        assertion: 'signed-assertion',
        refresh_token: 'refresh-token',
      })
    ).toThrow();
  });

  it('rejects the not-yet-supported dialog assertion type in Microsoft-first milestone', () => {
    expect(() =>
      ExtensionAuthRequestSchema.parse({
        assertion_type: 'owox_id_token',
        assertion: 'signed-assertion',
      })
    ).toThrow();
  });

  it('accepts a project-scoped refresh token', () => {
    expect(ExtensionAuthRequestSchema.parse({ refresh_token: 'refresh-token' })).toEqual({
      refresh_token: 'refresh-token',
    });
  });
});
