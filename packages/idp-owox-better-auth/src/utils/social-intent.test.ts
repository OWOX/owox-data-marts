import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import {
  consumeSocialIntentNonce,
  consumeVerifiedSocialIntent,
  persistVerifiedSocialIntent,
} from './social-intent.js';

function request(cookie: string): Request {
  return {
    protocol: 'https',
    hostname: 'app.test',
    headers: { cookie },
  } as unknown as Request;
}

function response(): Response {
  return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
}

describe('social intent cookies', () => {
  it('consumes a nonce once and rejects its replay without the browser cookie', () => {
    const nonce = 'button-nonce';
    const nonceCookie = encodeURIComponent(
      JSON.stringify([{ value: nonce, issuedAt: Date.now() }])
    );
    const firstResponse = response();

    expect(
      consumeSocialIntentNonce(
        request(`idp-owox-social-intent=${nonceCookie}`),
        firstResponse,
        nonce
      )
    ).toBe(true);
    expect(firstResponse.clearCookie).toHaveBeenCalledWith(
      'idp-owox-social-intent',
      expect.anything()
    );
    expect(consumeSocialIntentNonce(request(''), response(), nonce)).toBe(false);
  });

  it('expires a nonce after two minutes', () => {
    const nonceCookie = encodeURIComponent(
      JSON.stringify([{ value: 'old-nonce', issuedAt: Date.now() - 120001 }])
    );

    expect(
      consumeSocialIntentNonce(
        request(`idp-owox-social-intent=${nonceCookie}`),
        response(),
        'old-nonce'
      )
    ).toBe(false);
  });

  it('keeps a verified provider for at most two minutes and consumes it on render', () => {
    const setResponse = response();
    persistVerifiedSocialIntent(request(''), setResponse, 'microsoft');
    expect(setResponse.cookie).toHaveBeenCalledWith(
      'idp-owox-verified-social-intent',
      'microsoft',
      expect.objectContaining({ maxAge: 120000, httpOnly: true })
    );

    const renderResponse = response();
    expect(
      consumeVerifiedSocialIntent(
        request('idp-owox-verified-social-intent=microsoft'),
        renderResponse
      )
    ).toBe('microsoft');
    expect(renderResponse.clearCookie).toHaveBeenCalledWith(
      'idp-owox-verified-social-intent',
      expect.anything()
    );
  });
});
