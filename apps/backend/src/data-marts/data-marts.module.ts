import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { DataMartController } from './controllers/data-mart.controller';
import { DataStorageController } from './controllers/data-storage.controller';
import { CreateDataMartService } from './use-cases/create-data-mart.service';
import { ListDataMartsService } from './use-cases/list-data-marts.service';
import { GetDataMartService } from './use-cases/get-data-mart.service';
import { DataMartMapper } from './mappers/data-mart.mapper';
import { DataStorageService } from './services/data-storage.service';
import { DataStorageMapper } from './mappers/data-storage.mapper';
import { GetDataStorageService } from './use-cases/get-data-storage.service';
import { CreateDataStorageService } from './use-cases/create-data-storage.service';
import { UpdateDataStorageService } from './use-cases/update-data-storage.service';
import { DataMart } from './entities/data-mart.entity';
import { DataStorage } from './entities/data-storage.entity';
import { dataStorageFacadesProviders } from './data-storage-types/data-storage-facades';
import { dataStorageResolverProviders } from './data-storage-types/data-storage-providers';
import { UpdateDataMartDefinitionService } from './use-cases/update-data-mart-definition.service';
import { DataMartService } from './services/data-mart.service';
import { PublishDataMartService } from './use-cases/publish-data-mart.service';
import { UpdateDataMartDescriptionService } from './use-cases/update-data-mart-description.service';
import { UpdateDataMartTitleService } from './use-cases/update-data-mart-title.service';
import { ListDataStoragesService } from './use-cases/list-data-storages.service';

@Module({
  imports: [TypeOrmModule.forFeature([DataMart, DataStorage])],
  controllers: [DataMartController, DataStorageController],
  providers: [
    ...dataStorageResolverProviders,
    ...dataStorageFacadesProviders,
    DataMartService,
    CreateDataMartService,
    ListDataMartsService,
    GetDataMartService,
    UpdateDataMartDefinitionService,
    PublishDataMartService,
    UpdateDataMartDescriptionService,
    UpdateDataMartTitleService,
    DataMartMapper,
    DataStorageService,
    DataStorageMapper,
    ListDataStoragesService,
    GetDataStorageService,
    CreateDataStorageService,
    UpdateDataStorageService,
  ],
})
export class DataMartsModule {}
