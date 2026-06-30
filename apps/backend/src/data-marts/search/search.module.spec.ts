jest.mock('../../common/common.module', () => ({
  CommonModule: jest.fn(),
}));

jest.mock('../../idp/idp.module', () => ({
  IdpModule: jest.fn(),
}));

jest.mock('../data-marts.module', () => ({
  DataMartsModule: jest.fn(),
}));

jest.mock('../controllers/search.controller', () => ({
  SearchController: jest.fn(),
}));

import { MODULE_METADATA } from '@nestjs/common/constants';
import { SEARCH_FACADE, SEARCH_SEMANTIC_ENGINE } from '../../common/search/search.facade';
import { IdpModule } from '../../idp/idp.module';
import { SearchController } from '../controllers/search.controller';
import { SearchModule } from './search.module';

describe('SearchModule', () => {
  it('imports IdpModule for SearchController auth guard dependencies', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SearchModule) ?? [];

    expect(imports).toContain(IdpModule);
  });

  it('registers the search controller', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SearchModule) ?? [];

    expect(controllers).toContain(SearchController);
  });

  it('exports the public search facade and semantic engine tokens', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SearchModule) ?? [];

    expect(exports).toEqual(expect.arrayContaining([SEARCH_FACADE, SEARCH_SEMANTIC_ENGINE]));
  });
});
