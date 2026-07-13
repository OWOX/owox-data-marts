import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpResourceModule } from '../../mcp-resource/mcp-resource.module';
import { OAuthAuthorizationController } from './controllers/oauth-authorization.controller';
import { OAuthJwksController } from './controllers/oauth-jwks.controller';
import { OAuthMetadataController } from './controllers/oauth-metadata.controller';
import { OAuthRegistrationController } from './controllers/oauth-registration.controller';
import { OAuthTokenController } from './controllers/oauth-token.controller';
import { IdpProviderOAuthAdapter } from './idp-provider-oauth.adapter';
import { OAuthClientRegistry } from './oauth-client.registry';
import { OAuthConfigService } from './oauth-config.service';
import { OAuthDynamicClientService } from './oauth-dynamic-client.service';
import { OAUTH_IDP_PORT } from './oauth-idp.port';
import { OAuthProjectSelectionService } from './oauth-project-selection.service';
import { OAuthProjectMemberResolver } from './oauth-project-member.resolver';
import { OAuthRequestValidator } from './oauth-request.validator';
import { OAuthDynamicClient } from './entities/oauth-dynamic-client.entity';
import { ProjectProjection } from '../entities/project-projection.entity';
import { UserProjection } from '../entities/user-projection.entity';
import { IdpGuard } from '../guards';
import { IdpProjectionsService } from '../services/idp-projections.service';
import { IdpProviderService } from '../services/idp-provider.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProjection, ProjectProjection, OAuthDynamicClient]),
    McpResourceModule,
  ],
  controllers: [
    OAuthAuthorizationController,
    OAuthJwksController,
    OAuthMetadataController,
    OAuthRegistrationController,
    OAuthTokenController,
  ],
  providers: [
    OAuthConfigService,
    OAuthClientRegistry,
    OAuthDynamicClientService,
    OAuthRequestValidator,
    OAuthProjectSelectionService,
    OAuthProjectMemberResolver,
    IdpProviderService,
    IdpGuard,
    IdpProjectionsService,
    IdpProviderOAuthAdapter,
    {
      provide: OAUTH_IDP_PORT,
      useExisting: IdpProviderOAuthAdapter,
    },
  ],
  exports: [OAUTH_IDP_PORT, OAuthConfigService],
})
export class OAuthModule {}
