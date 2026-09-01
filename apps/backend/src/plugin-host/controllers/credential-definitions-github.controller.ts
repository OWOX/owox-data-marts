import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Auth, RejectPluginAuth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { CredentialDefinitionApiDto } from '../../data-marts/credentials/dto/credential-api.dto';
import { mapCredentialDefinitionToApiDto } from '../../data-marts/credentials/mappers/credential.mapper';
import { ExternalCredentialDefinitionSyncService } from '../services/external-credential-definition-sync.service';

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
  constructor(private readonly sync: ExternalCredentialDefinitionSyncService) {}

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post('github')
  @HttpCode(200)
  @ApiOkResponse({ type: CredentialDefinitionApiDto })
  async add(
    @Body() input: AddGithubCredentialDefinitionApiDto
  ): Promise<CredentialDefinitionApiDto> {
    const definition = await this.sync.syncLocator(input.repository);
    return mapCredentialDefinitionToApiDto(definition);
  }
}
