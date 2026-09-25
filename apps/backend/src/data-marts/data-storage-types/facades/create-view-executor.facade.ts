import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../data-storage-credentials.type';
import { DataStorageConfig } from '../data-storage-config.type';
import { CreateViewExecutor, CreateViewResult } from '../interfaces/create-view-executor.interface';
import { CREATE_VIEW_EXECUTOR_RESOLVER } from '../data-storage-providers';

@Injectable()
export class CreateViewExecutorFacade {
  constructor(
    @Inject(CREATE_VIEW_EXECUTOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, CreateViewExecutor>
  ) {}

  async createView(
    type: DataStorageType,
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    viewName: string,
    sql: string
  ): Promise<CreateViewResult> {
    const executor = await this.resolver.resolve(type);
    return executor.createView(credentials, config, viewName, sql);
  }
}
