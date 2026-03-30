import { describe, expect, it } from '@jest/globals';
import { GoogleSheetsExtensionAuthRequestSchema } from './google-sheets-auth-request.dto.js';

describe('GoogleSheetsExtensionAuthRequestSchema', () => {
  it('should accept valid project_id', () => {
    const validData = {
      google_id_token: 'valid-token',
      project_id: 'my-project_123',
    };
    const result = GoogleSheetsExtensionAuthRequestSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject project_id with invalid characters', () => {
    const invalidData = {
      google_id_token: 'valid-token',
      project_id: 'invalid project!',
    };
    const result = GoogleSheetsExtensionAuthRequestSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should require either google_id_token or refresh_token', () => {
    const invalidData = {
      project_id: 'my-project',
    };
    const result = GoogleSheetsExtensionAuthRequestSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toBe(
        'Either google_id_token or refresh_token is required'
      );
    }
  });
});
