import { Injectable } from '@nestjs/common';

export const API_KEY_PREFIX = 'owox_key_';

export type ProjectMemberApiKeyComponents = {
  apiOrigin: string;
  apiKeyId: string;
  secret: string;
};

@Injectable()
export class ProjectMemberApiKeyCodecService {
  encode(components: ProjectMemberApiKeyComponents): string {
    const json = JSON.stringify({
      apiOrigin: components.apiOrigin,
      apiKeyId: components.apiKeyId,
      apiKeySecret: components.secret,
    });

    return `${API_KEY_PREFIX}${Buffer.from(json, 'utf8').toString('base64url')}`;
  }
}
