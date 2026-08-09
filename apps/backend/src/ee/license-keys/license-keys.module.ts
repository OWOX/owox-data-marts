import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { DataMartsModule } from '../../data-marts/data-marts.module';
import { IdpModule } from '../../idp/idp.module';
import { LicenseGatewayController } from './controllers/license-gateway.controller';
import { LicenseKeyController } from './controllers/license-key.controller';
import { LicenseKey } from './entities/license-key.entity';
import { LicenseKeyGuard } from './guards/license-key.guard';
import { LicenseKeySignerService } from './services/license-key-signer.service';
import { LicenseKeyService } from './services/license-key.service';

/**
 * Issuance, management and the customer-facing license gateway. Controllers are mounted
 * only on the Cloud deployment, which can impersonate the OWOX license service account.
 */
@Module({})
export class LicenseKeysModule {
  static register(): DynamicModule {
    const cloudEnabled = process.env.LICENSE_ISSUANCE_ENABLED === 'true';

    return {
      module: LicenseKeysModule,
      imports: [TypeOrmModule.forFeature([LicenseKey]), CommonModule, IdpModule, DataMartsModule],
      controllers: cloudEnabled ? [LicenseKeyController, LicenseGatewayController] : [],
      providers: [LicenseKeyService, LicenseKeySignerService, LicenseKeyGuard],
      exports: [LicenseKeyService],
    };
  }
}
