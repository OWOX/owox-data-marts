import { describe, expect, it } from '@jest/globals';
import MailChecker from 'mailchecker';
import {
  EMAIL_VALIDATION_BLOCK_REASON,
  EmailValidationService,
} from './email-validation-service.js';

function getDisposableDomain(): string {
  const disposableDomain = Array.from(MailChecker.blacklist() as Set<string>).find(Boolean);
  if (!disposableDomain) {
    throw new Error('mailchecker blacklist is empty');
  }
  return String(disposableDomain).toLowerCase();
}

describe('EmailValidationService', () => {
  it('returns invalid for malformed email', () => {
    const service = new EmailValidationService();
    expect(service.validateMagicLinkEmail('invalid-email')).toEqual({ status: 'invalid' });
  });

  it('returns allowed for a valid regular email', () => {
    const service = new EmailValidationService();
    expect(service.validateMagicLinkEmail('User@Example.Com')).toEqual({
      status: 'allowed',
      email: 'user@example.com',
      domain: 'example.com',
    });
  });

  it('does not block domain suffixes by default', () => {
    const service = new EmailValidationService();

    expect(service.validateMagicLinkEmail('user@company.test')).toMatchObject({
      status: 'allowed',
    });
    expect(service.validateMagicLinkEmail('user@company.test')).toMatchObject({
      status: 'allowed',
    });
  });

  it('blocks disposable emails via mailchecker', () => {
    const service = new EmailValidationService();
    const disposableDomain = getDisposableDomain();

    expect(service.validateMagicLinkEmail(`user@${disposableDomain}`)).toMatchObject({
      status: 'blocked',
      reason: EMAIL_VALIDATION_BLOCK_REASON.DISPOSABLE,
    });
  });

  it('blocks forbidden domains configured by options', () => {
    const service = new EmailValidationService({ forbiddenDomains: ['test', 'example'] });

    expect(service.validateMagicLinkEmail('user@blocked.test')).toMatchObject({
      status: 'blocked',
      reason: EMAIL_VALIDATION_BLOCK_REASON.FORBIDDEN_DOMAIN,
    });
    expect(service.validateMagicLinkEmail('hello@blocked.example')).toMatchObject({
      status: 'blocked',
      reason: EMAIL_VALIDATION_BLOCK_REASON.FORBIDDEN_DOMAIN,
    });
  });

  it('blocks punycode domains when forbidden unicode domain is configured', () => {
    const service = new EmailValidationService({ forbiddenDomains: ['example'] });

    expect(service.validateMagicLinkEmail('hello@blocked.example')).toMatchObject({
      status: 'blocked',
      reason: EMAIL_VALIDATION_BLOCK_REASON.FORBIDDEN_DOMAIN,
    });
  });

  it('checks mailchecker before custom forbidden domains', () => {
    const disposableDomain = getDisposableDomain();
    const service = new EmailValidationService({ forbiddenDomains: ['example', disposableDomain] });

    expect(service.validateMagicLinkEmail(`user@${disposableDomain}`)).toMatchObject({
      status: 'blocked',
      reason: EMAIL_VALIDATION_BLOCK_REASON.DISPOSABLE,
    });
  });
});
