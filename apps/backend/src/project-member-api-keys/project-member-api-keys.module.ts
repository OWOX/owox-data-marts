import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectMemberApiKey } from './entities/project-member-api-key.entity';
import { ProjectMemberApiKeyMapper } from './mappers/project-member-api-key.mapper';
import { ProjectMemberApiKeyCryptoService } from './services/project-member-api-key-crypto.service';
import { ProjectMemberApiKeyService } from './services/project-member-api-key.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectMemberApiKey])],
  providers: [
    ProjectMemberApiKeyService,
    ProjectMemberApiKeyCryptoService,
    ProjectMemberApiKeyMapper,
  ],
  exports: [ProjectMemberApiKeyService],
})
export class ProjectMemberApiKeysModule {}
