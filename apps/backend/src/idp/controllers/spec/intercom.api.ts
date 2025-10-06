import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { IntercomTokenResponseApiDto } from '../../dto/presentation/intercom-token-response-api.dto';

export function IssueIntercomJwtSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Returns Intercom user verification JWT' }),
    ApiOkResponse({ description: 'JWT token', type: IntercomTokenResponseApiDto }),
    ApiBadRequestResponse({ description: 'Missing INTERCOM_SECRET_KEY' }),
    ApiUnauthorizedResponse({ description: 'Unauthorized' })
  );
}
