import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { SearchResultResponseApiDto } from '../../dto/presentation/search-result-response-api.dto';

export function SearchSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Search project entities',
      description:
        'Returns data marts, data storages, and data destinations visible to the caller. ' +
        'Search uses semantic and keyword signals and falls back to keyword matching when ' +
        'prompt embeddings are unavailable.',
    }),
    ApiQuery({
      name: 'q',
      required: true,
      type: String,
      example: 'monthly revenue by channel',
      description: 'Search query',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
      },
      example: 10,
      description: 'Maximum number of results to return (1-50)',
    }),
    ApiQuery({
      name: 'entityTypes',
      required: false,
      enum: SearchableEntityType,
      isArray: true,
      style: 'form',
      explode: false,
      example: [SearchableEntityType.DATA_MART],
      description: 'Restrict results to the given entity types (comma-separated)',
    }),
    ApiQuery({
      name: 'excludeDrafts',
      required: false,
      type: Boolean,
      example: true,
      description: 'When true, exclude draft data marts from results',
    }),
    ApiOkResponse({ type: [SearchResultResponseApiDto] })
  );
}
