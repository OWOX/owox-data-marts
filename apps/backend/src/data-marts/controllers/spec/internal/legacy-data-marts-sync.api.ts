import { applyDecorators } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiParam } from '@nestjs/swagger';

export function SyncLegacyDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Sync legacy data mart by ID' }),
    ApiParam({ name: 'id', description: 'Data mart ID' }),
    ApiNoContentResponse({ description: 'Data sync initiated' })
  );
}

export function DeleteLegacyDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Delete legacy data mart by ID' }),
    ApiParam({ name: 'id', description: 'Data mart ID' }),
    ApiNoContentResponse({ description: 'Data mart deletion initiated' })
  );
}
