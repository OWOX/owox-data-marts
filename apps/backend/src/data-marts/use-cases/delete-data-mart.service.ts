import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../entities/data-mart.entity';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';

@Injectable()
export class DeleteDataMartService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>
  ) {}

  async run(command: DeleteDataMartCommand): Promise<void> {
    await this.dataMartRepo.softDelete({
      id: command.id,
      projectId: command.projectId,
      createdById: command.userId,
    });
  }
}
