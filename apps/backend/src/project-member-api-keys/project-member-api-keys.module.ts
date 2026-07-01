import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdpModule } from '../idp/idp.module';
import { ApiKeyExchangeController } from './controllers/api-key-exchange.controller';
import { ProjectMemberApiKey } from './entities/project-member-api-key.entity';
import { ProjectMemberApiKeyMapper } from './mappers/project-member-api-key.mapper';
import { ProjectMemberApiKeyCodecService } from './services/project-member-api-key-codec.service';
import { ProjectMemberApiKeyCryptoService } from './services/project-member-api-key-crypto.service';
import { ProjectMemberApiKeyService } from './services/project-member-api-key.service';
import { ExchangeProjectMemberApiKeyService } from './use-cases/exchange-project-member-api-key.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectMemberApiKey]), IdpModule],
  controllers: [ApiKeyExchangeController],
  providers: [
    ProjectMemberApiKeyService,
    ProjectMemberApiKeyCodecService,
    ProjectMemberApiKeyCryptoService,
    ProjectMemberApiKeyMapper,
    ExchangeProjectMemberApiKeyService,
  ],
  exports: [ProjectMemberApiKeyService, ProjectMemberApiKeyCodecService],
})
export class ProjectMemberApiKeysModule {}
