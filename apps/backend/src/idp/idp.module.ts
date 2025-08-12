import { Module } from '@nestjs/common';
import { IdpAuthGuard, IdpRoleGuard } from './guards';

@Module({
  imports: [],
  controllers: [],
  providers: [IdpAuthGuard, IdpRoleGuard],
  exports: [IdpAuthGuard, IdpRoleGuard],
})
export class IdpModule {}
