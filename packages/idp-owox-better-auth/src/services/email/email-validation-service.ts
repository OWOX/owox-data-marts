import MailChecker from 'mailchecker';
import { domainToASCII, domainToUnicode } from 'url';
import { parseEmail } from '../../utils/email-utils.js';

export const EMAIL_VALIDATION_BLOCK_REASON = {
  DISPOSABLE: 'disposable',
  FORBIDDEN_DOMAIN: 'forbidden_domain',
} as const;

export type EmailValidationBlockReason =
  (typeof EMAIL_VALIDATION_BLOCK_REASON)[keyof typeof EMAIL_VALIDATION_BLOCK_REASON];

export type EmailValidationResult =
  | {
      status: 'allowed';
      email: string;
      domain: string;
    }
  | {
      status: 'blocked';
      email: string;
      domain: string;
      reason: EmailValidationBlockReason;
    }
  | {
      status: 'invalid';
    };

type EmailValidationOptions = {
  forbiddenDomains?: string[];
};

export class EmailValidationService {
  private readonly forbiddenDomainRules: string[];

  constructor(options: EmailValidationOptions = {}) {
    this.forbiddenDomainRules = normalizeForbiddenDomains(options.forbiddenDomains ?? []);
  }

  validateMagicLinkEmail(value: unknown): EmailValidationResult {
    const email = parseEmail(value);
    if (!email) {
      return { status: 'invalid' };
    }

    const domain = extractEmailDomain(email);
    if (!domain) {
      return { status: 'invalid' };
    }

    if (this.isDisposableEmail(email)) {
      return {
        status: 'blocked',
        email,
        domain,
        reason: EMAIL_VALIDATION_BLOCK_REASON.DISPOSABLE,
      };
    }

    if (this.isForbiddenDomain(domain)) {
      return {
        status: 'blocked',
        email,
        domain,
        reason: EMAIL_VALIDATION_BLOCK_REASON.FORBIDDEN_DOMAIN,
      };
    }

    return {
      status: 'allowed',
      email,
      domain,
    };
  }

  private isDisposableEmail(email: string): boolean {
    const domain = extractEmailDomain(email);
    if (!domain) {
      return false;
    }

    const asciiDomain = normalizeDomain(domainToASCII(domain)) || domain;
    // Use probe local-part to avoid rejecting unicode local-part by format regex.
    return !MailChecker.isValid(`probe@${asciiDomain}`);
  }

  private isForbiddenDomain(domain: string): boolean {
    if (!this.forbiddenDomainRules.length) {
      return false;
    }

    return buildDomainForms(domain).some(form =>
      this.forbiddenDomainRules.some(
        forbiddenDomain => form === forbiddenDomain || form.endsWith(`.${forbiddenDomain}`)
      )
    );
  }
}

function normalizeForbiddenDomains(forbiddenDomains: string[]): string[] {
  const rules = new Set<string>();
  for (const rawDomain of forbiddenDomains) {
    for (const form of buildDomainForms(rawDomain)) {
      rules.add(form);
    }
  }
  return Array.from(rules);
}

function buildDomainForms(rawDomain: string): string[] {
  const normalized = normalizeDomain(rawDomain);
  if (!normalized) {
    return [];
  }

  const forms = new Set<string>([normalized]);
  const ascii = normalizeDomain(domainToASCII(normalized));
  const unicode = normalizeDomain(domainToUnicode(normalized));

  if (ascii) {
    forms.add(ascii);
  }

  if (unicode) {
    forms.add(unicode);
  }

  return Array.from(forms);
}

function normalizeDomain(rawDomain: string): string {
  return rawDomain.trim().toLowerCase().replace(/^@+/, '').replace(/^\.+/, '').replace(/\.+$/, '');
}

function extractEmailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex >= email.length - 1) {
    return null;
  }
  const domain = normalizeDomain(email.slice(atIndex + 1));
  return domain || null;
}
