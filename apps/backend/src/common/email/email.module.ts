import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER_FACADE } from './shared/email-provider.facade';
import { SendgridProvider } from './providers/sendgrid-provider';
import { NoopEmailProvider } from './providers/noop-provider';

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
        const name = (config.get<string>('EMAIL_PROVIDER') ?? 'none').toLowerCase();
        switch (name) {
          case 'sendgrid':
            return new SendgridProvider(config);
          case 'none':
            return new NoopEmailProvider();
          default:
            throw new Error(`Unsupported EMAIL_PROVIDER=${name}. Allowed: sendgrid|none`);
        }
      },
    },
  ],
  exports: [EMAIL_PROVIDER_FACADE],
})
export class EmailModule {}
