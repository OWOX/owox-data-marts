import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Auth, AuthContext, type AuthorizationContext, RejectPluginAuth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { CredentialDefinitionApiDto } from '../../data-marts/credentials/dto/credential-api.dto';
import { mapCredentialDefinitionToApiDto } from '../../data-marts/credentials/mappers/credential.mapper';
import { AddGithubCredentialDefinitionService } from '../use-cases/add-github-credential-definition.service';

class AddGithubCredentialDefinitionApiDto {
  @ApiProperty({ example: '@owner/repository' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  repository: string;
}

@ApiTags('Credentials')
@Controller('credentials/definitions')
@RejectPluginAuth()
export class CredentialDefinitionsGithubController {
  constructor(private readonly addDefinition: AddGithubCredentialDefinitionService) {}

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post('github')
  @HttpCode(200)
  @ApiOkResponse({ type: CredentialDefinitionApiDto })
  async add(
    @AuthContext() context: AuthorizationContext,
    @Body() input: AddGithubCredentialDefinitionApiDto
  ): Promise<CredentialDefinitionApiDto> {
    const definition = await this.addDefinition.run(context, input.repository);
    return mapCredentialDefinitionToApiDto(definition);
  }
}
