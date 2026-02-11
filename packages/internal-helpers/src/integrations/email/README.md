# Email integration (integrations/email)

Simple email sending abstraction with SendGrid support and a noop fallback.

## Supported providers

- `sendgrid` — sends emails via SendGrid API.
- `none` — noop provider: logs and throws on send.

## Usage

```ts
import {
  createMailingProvider,
  type EmailProvider,
  type EmailProviderName,
} from '@owox/internal-helpers';

const provider = createMailingProvider({
  provider: 'sendgrid',
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY as string,
    verifiedSenderEmail: process.env.SENDGRID_VERIFIED_SENDER_EMAIL as string,
    verifiedSenderName: process.env.SENDGRID_VERIFIED_SENDER_NAME ?? undefined,
  },
});

await provider.sendEmail('user@example.com', 'Hello', '<b>Hi there</b>');
```

## Configuration (SendGrid)

- `apiKey` — SendGrid API key (required).
- `verifiedSenderEmail` — verified sender email in your SendGrid account (required).
- `verifiedSenderName` — optional sender name.

## Noop provider behavior

When `provider: 'none'` the returned provider will log an error and throw on `sendEmail`. Use it for environments where email must be disabled but code paths stay intact.

## NestJS example (backend)

`apps/backend/src/common/email/email.module.ts` shows how to wire the provider via Nest DI using config values (`EMAIL_PROVIDER`, `SENDGRID_*`). The module simply delegates to `createMailingProvider`.
