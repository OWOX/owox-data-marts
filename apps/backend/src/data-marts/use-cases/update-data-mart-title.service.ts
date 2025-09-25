import { Injectable } from '@nestjs/common';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { Repository } from 'typeorm';
import { DataMartService } from '../services/data-mart.service';
import { UpdateDataMartTitleCommand } from '../dto/domain/update-data-mart-title.command';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class UpdateDataMartTitleService {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepository: Repository<DataMart>,
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: UpdateDataMartTitleCommand): Promise<DataMartDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    dataMart.title = command.title;
    await this.dataMartRepository.save(dataMart);

    return this.mapper.toDomainDto(dataMart);
  }
}
