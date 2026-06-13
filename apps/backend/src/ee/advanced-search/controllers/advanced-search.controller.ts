import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, Role, Strategy } from '../../../idp';
import type { AuthorizationContext } from '../../../idp/types/auth.types';
import {
  ADVANCED_SEARCH_FACADE,
  AdvancedSearchFacade,
  SearchResult,
} from '../../../common/ee-contracts/advanced-search.facade';
import { EeLicenseService } from '../../shared/ee-license.service';
import { AdvancedSearchQueryDto } from './advanced-search-query.dto';
import { AdvancedSearchSpec } from './spec/advanced-search.api';

@ApiTags('DataMarts')
@Controller('data-marts')
export class AdvancedSearchController {
  constructor(
    @Inject(ADVANCED_SEARCH_FACADE) private readonly facade: AdvancedSearchFacade,
    private readonly eeLicense: EeLicenseService
  ) {}

  // Two path segments on purpose: core's GET data-marts/:id is registered first and captures any single-segment suffix
  @Auth(Role.viewer(Strategy.PARSE))
  @Get('search/advanced')
  @AdvancedSearchSpec()
  async search(
    @AuthContext() context: AuthorizationContext,
    @Query() query: AdvancedSearchQueryDto
  ): Promise<SearchResult[]> {
    this.eeLicense.verifyLicensed();
    return this.facade.search(context.projectId, query.q, {
      topK: query.limit,
      entityTypes: query.entityTypes,
      accessScope: { userId: context.userId, roles: context.roles ?? [] },
    });
  }
}
