import { DynamicModule, Module } from '@nestjs/common';
import { AdvancedSearchModule } from './advanced-search/advanced-search.module';

@Module({})
export class EeModule {
  static register(): DynamicModule {
    return {
      module: EeModule,
      imports: [AdvancedSearchModule.register()],
    };
  }
}
