import { applyDecorators } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchableEntityType } from '../../../../common/ee-contracts/advanced-search.facade';
import { AdvancedSearchResultResponseApiDto } from '../advanced-search-result-response-api.dto';

export function AdvancedSearchSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Hybrid semantic + keyword search over data marts',
      description:
        'Enterprise-only. Returns the most relevant data marts for a natural-language query, ' +
        'restricted to entities the caller is allowed to see.',
    }),
    ApiQuery({
      name: 'q',
      required: true,
      type: String,
      example: 'monthly revenue by channel',
      description: 'Natural-language search query',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: 10,
      description: 'Maximum number of results to return (1-50)',
    }),
    ApiQuery({
      name: 'entityTypes',
      required: false,
      enum: SearchableEntityType,
      isArray: true,
      example: [SearchableEntityType.DATA_MART],
      description: 'Restrict results to the given entity types (comma-separated)',
    }),
    ApiOkResponse({ type: [AdvancedSearchResultResponseApiDto] }),
    ApiForbiddenResponse({ description: 'Enterprise license required' })
  );
}
