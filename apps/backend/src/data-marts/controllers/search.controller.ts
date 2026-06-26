import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, Role, Strategy } from '../../idp';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { SEARCH_FACADE, SearchFacade } from '../../common/search/search.facade';
import { SearchQueryDto } from '../dto/presentation/search-query.dto';
import { SearchResultResponseApiDto } from '../dto/presentation/search-result-response-api.dto';
import { SEARCH_CONFIG, SearchConfig } from '../search/config/search.config';
import { SearchSpec } from './spec/search.api';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(
    @Inject(SEARCH_FACADE) private readonly facade: SearchFacade,
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @SearchSpec()
  async search(
    @AuthContext() context: AuthorizationContext,
    @Query() query: SearchQueryDto
  ): Promise<SearchResultResponseApiDto[]> {
    const normalizedQuery = query.q;

    if (normalizedQuery.length < this.config.queryMinLength) {
      throw new BadRequestException(
        `Query must be at least ${this.config.queryMinLength} characters`
      );
    }

    if (normalizedQuery.length > this.config.queryMaxLength) {
      throw new BadRequestException(
        `Query must be at most ${this.config.queryMaxLength} characters`
      );
    }

    return this.facade.search(context.projectId, normalizedQuery, {
      topK: query.limit ?? this.config.topK,
      entityTypes: query.entityTypes,
      accessScope: { userId: context.userId, roles: context.roles ?? [] },
      excludeDrafts: query.excludeDrafts,
    });
  }
}
