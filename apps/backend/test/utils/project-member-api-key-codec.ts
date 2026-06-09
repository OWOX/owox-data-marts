import { API_KEY_PREFIX } from '../../src/project-member-api-keys/services/project-member-api-key-codec.service';

export type DecodedProjectMemberApiKey = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
};

export function decodeProjectMemberApiKey(apiKey: string): DecodedProjectMemberApiKey {
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    throw new Error(`Expected API key to start with ${API_KEY_PREFIX}`);
  }

  return JSON.parse(
    Buffer.from(apiKey.slice(API_KEY_PREFIX.length), 'base64url').toString('utf8')
  ) as DecodedProjectMemberApiKey;
}
