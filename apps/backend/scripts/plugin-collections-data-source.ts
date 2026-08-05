import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createPluginCollectionsDataSourceOptions } from '../src/config/plugin-collections-data-source-options.config';
import { loadEnv } from '../src/load-env';

loadEnv();

export default new DataSource(createPluginCollectionsDataSourceOptions(new ConfigService()));
