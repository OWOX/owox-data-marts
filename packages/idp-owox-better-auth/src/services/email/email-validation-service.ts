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
  /** Domain suffixes to block (e.g., 'test', 'example'). Blocks emails where domain ends with these suffixes. */
  forbiddenDomains?: string[];
};

/**
 * Validates email addresses for magic link authentication.
 *
 * Two security checks:
 * 1. Blocks disposable/temporary email domains (via MailChecker)
 * 2. Blocks emails with forbidden domain suffixes
 *
 * Suffix matching:
 * - 'example' blocks 'company.example' and 'sub.company.example'
 * - 'example' does NOT block 'example.com'
 * - To block 'example.com', use suffix 'example.com'
 *
 * @example
 * const service = new EmailValidationService({
 *   forbiddenDomains: ['test', 'example']
 * });
 *
 * // Allowed
 * service.validateMagicLinkEmail('user@gmail.com');     // ends with .com
 * service.validateMagicLinkEmail('user@example.com');  // ends with .com, not .example
 *
 * // Blocked - forbidden suffix
 * service.validateMagicLinkEmail('user@company.test');      // ends with .test
 * service.validateMagicLinkEmail('user@sub.mail.example');  // ends with .example
 */
export class EmailValidationService {
  private readonly forbiddenDomainSuffixes: string[];

  constructor(options: EmailValidationOptions = {}) {
    this.forbiddenDomainSuffixes = normalizeForbiddenSuffixes(options.forbiddenDomains ?? []);
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

    if (this.matchesForbiddenSuffix(domain)) {
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

  /**
   * Checks if email uses a disposable/temporary email service.
   * Uses MailChecker library which maintains a list of known disposable domains.
   */
  private isDisposableEmail(email: string): boolean {
    const domain = extractEmailDomain(email);
    if (!domain) {
      return false;
    }

    const asciiDomain = normalizeDomain(domainToASCII(domain)) || domain;
    // Use probe local-part to avoid rejecting unicode local-part by format regex.
    return !MailChecker.isValid(`probe@${asciiDomain}`);
  }

  /**
   * Checks if domain matches any forbidden suffix.
   * Matches only the END of domain (e.g., 'test' matches 'mail.test' but not 'test.com').
   *
   * @example
   * // forbidden suffixes: ['example', 'test']
   *
   * matchesForbiddenSuffix('company.example')       // true - ends with .example
   * matchesForbiddenSuffix('sub.company.example')   // true - ends with .example
   * matchesForbiddenSuffix('example.com')           // false - ends with .com
   * matchesForbiddenSuffix('test.org')              // false - ends with .org
   */
  private matchesForbiddenSuffix(domain: string): boolean {
    if (!this.forbiddenDomainSuffixes.length) {
      return false;
    }

    return buildDomainForms(domain).some(form =>
      this.forbiddenDomainSuffixes.some(suffix => form === suffix || form.endsWith(`.${suffix}`))
    );
  }
}

/**
 * Normalizes forbidden suffixes for fast lookup.
 * Generates all forms (ASCII and Unicode) to handle IDN domains.
 *
 * @example
 * normalizeForbiddenSuffixes(['TEST', 'münchen'])
 * // ['test', 'münchen', 'xn--mnchen-3ya'] - normalized + all IDN forms
 */
function normalizeForbiddenSuffixes(suffixes: string[]): string[] {
  const normalizedSuffixes = new Set<string>();
  for (const rawSuffix of suffixes) {
    for (const form of buildDomainForms(rawSuffix)) {
      normalizedSuffixes.add(form);
    }
  }
  return Array.from(normalizedSuffixes);
}

/**
 * Generates all canonical forms of a domain for security matching.
 *
 * Why multiple forms? To prevent bypass via IDN encoding:
 * - Blocking 'münchen.de' must also block 'xn--mnchen-3ya.de' (punycode)
 * - Blocking 'xn--mnchen-3ya.de' must also block 'münchen.de'
 *
 * @example
 * buildDomainForms("GOOGLE.COM")        // ['google.com']
 * buildDomainForms("münchen.de")        // ['münchen.de', 'xn--mnchen-3ya.de']
 * buildDomainForms("xn--mnchen-3ya.de") // ['xn--mnchen-3ya.de', 'münchen.de']
 */
function buildDomainForms(rawDomain: string): string[] {
  // Guard: domainToASCII(null) returns "null" string - security bypass risk
  if (typeof rawDomain !== 'string') {
    return [];
  }

  const normalized = normalizeDomain(rawDomain);
  if (!normalized) {
    return [];
  }

  const forms = new Set<string>([normalized]);

  // Add punycode form for IDN domains (e.g., münchen.de → xn--mnchen-3ya.de)
  const ascii = normalizeDomain(domainToASCII(normalized));
  if (ascii && ascii !== normalized) {
    forms.add(ascii);
  }

  // Add unicode form for punycode domains (e.g., xn--mnchen-3ya.de → münchen.de)
  const unicode = normalizeDomain(domainToUnicode(normalized));
  if (unicode && unicode !== normalized) {
    forms.add(unicode);
  }

  return Array.from(forms);
}

/**
 * Normalizes domain string: lowercase, trim, remove leading @ and dots, trailing dots.
 *
 * @example
 * normalizeDomain("@GOOGLE.COM.")  // "google.com"
 * normalizeDomain("  Test.COM  ") // "test.com"
 */
function normalizeDomain(rawDomain: string): string {
  return rawDomain.trim().toLowerCase().replace(/^@+/, '').replace(/^\.+/, '').replace(/\.+$/, '');
}

/**
 * Extracts domain part from email address.
 *
 * @example
 * extractEmailDomain("user@gmail.com")  // "gmail.com"
 * extractEmailDomain("invalid")         // null
 */
function extractEmailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex >= email.length - 1) {
    return null;
  }
  const domain = normalizeDomain(email.slice(atIndex + 1));
  return domain || null;
}
