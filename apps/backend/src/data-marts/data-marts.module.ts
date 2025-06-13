import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { DataMartController } from './controllers/data-mart.controller';
import { DataStorageController } from './controllers/data-storage.controller';
import { CreateDataMartService } from './use-cases/create-data-mart.service';
import { ListDataMartsService } from './use-cases/list-data-marts.service';
import { GetDataMartService } from './use-cases/get-data-mart.service';
import { DataMartMapper } from './mappers/data-mart.mapper';
import { DataStorageService } from './services/data-storage.service';
import { DataStorageTitleService } from './services/data-storage-title.service';
import { DataStorageAccessService } from './services/data-storage-access.service';
import { DataStorageMapper } from './mappers/data-storage.mapper';
import { GetDataStorageService } from './use-cases/get-data-storage.service';
import { CreateDataStorageService } from './use-cases/create-data-storage.service';
import { UpdateDataStorageService } from './use-cases/update-data-storage.service';
import { DataMart } from './entities/data-mart.entity';
import { DataStorage } from './entities/data-storage.entity';
import { dataStorageResolverProviders } from './module-providers/data-storage-resolvers.provider';

@Module({
  imports: [TypeOrmModule.forFeature([DataMart, DataStorage])],
  controllers: [DataMartController, DataStorageController],
  providers: [
    ...dataStorageResolverProviders,
    CreateDataMartService,
    ListDataMartsService,
    GetDataMartService,
    DataMartMapper,
    DataStorageService,
    DataStorageTitleService,
    DataStorageAccessService,
    DataStorageMapper,
    GetDataStorageService,
    CreateDataStorageService,
    UpdateDataStorageService,
  ],
})
export class DataMartsModule {}
