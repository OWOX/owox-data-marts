import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createMailingProvider, type EmailProviderName } from '@owox/internal-helpers';
import { EMAIL_PROVIDER_FACADE } from './shared/email-provider.facade';

/**
 * EmailModule provides email sending functionality based on the configured provider.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EMAIL_PROVIDER_FACADE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const name = (
          config.get<string>('EMAIL_PROVIDER') ?? 'none'
        ).toLowerCase() as EmailProviderName;

        return createMailingProvider({
          provider: name,
          sendgrid: {
            apiKey: config.get<string>('SENDGRID_API_KEY') as string,
            verifiedSenderEmail: config.get<string>(
              'NOTIFICATIONS_VERIFIED_SENDER_EMAIL'
            ) as string,
            verifiedSenderName:
              config.get<string>('NOTIFICATIONS_VERIFIED_SENDER_NAME') ?? undefined,
          },
        });
      },
    },
  ],
  exports: [EMAIL_PROVIDER_FACADE],
})
export class EmailModule {}
