import * as crypto from 'crypto';

export class MagicLinkService {
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static createUrl(baseUrl: string, token: string): string {
    const url = new URL('/auth/magic-link', baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  static parseToken(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('token');
    } catch {
      return null;
    }
  }
}
