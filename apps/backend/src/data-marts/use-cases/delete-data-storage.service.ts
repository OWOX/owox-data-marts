import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';

@Injectable()
export class DeleteDataStorageService {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepo: Repository<DataStorage>
  ) {}

  async run(command: DeleteDataStorageCommand): Promise<void> {
    await this.dataStorageRepo.delete({
      id: command.id,
      projectId: command.projectId,
    });
  }
}
