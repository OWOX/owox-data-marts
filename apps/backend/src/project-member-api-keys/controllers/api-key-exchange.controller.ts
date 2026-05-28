import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ExchangeProjectMemberApiKeyRequestApiDto } from '../dto/presentation/exchange-project-member-api-key-request-api.dto';
import { ExchangeProjectMemberApiKeyResponseApiDto } from '../dto/presentation/exchange-project-member-api-key-response-api.dto';
import { ExchangeProjectMemberApiKeyService } from '../use-cases/exchange-project-member-api-key.service';

@ApiTags('Project Member API Keys')
@Controller('auth/api-keys')
export class ApiKeyExchangeController {
  constructor(
    private readonly exchangeProjectMemberApiKeyService: ExchangeProjectMemberApiKeyService
  ) {}

  @Post('exchange')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a project member API key for an ODM access token' })
  @ApiHeader({ name: 'X-OWOX-Api-Key-Id', required: true })
  @ApiResponse({ status: 200, type: ExchangeProjectMemberApiKeyResponseApiDto })
  async exchange(
    @Headers('x-owox-api-key-id') apiKeyId: string | undefined,
    @Body() body: ExchangeProjectMemberApiKeyRequestApiDto
  ): Promise<ExchangeProjectMemberApiKeyResponseApiDto> {
    return this.exchangeProjectMemberApiKeyService.run({
      apiKeyId,
      apiKeySecret: body.apiKeySecret,
    });
  }
}
