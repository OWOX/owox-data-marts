import { Injectable } from '@nestjs/common';
import { DataMartService } from '../services/data-mart.service';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ListDataMartsByConnectorNameCommand } from '../dto/domain/list-data-mart-by-connector-name';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMart } from '../entities/data-mart.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';

@Injectable()
export class ListDataMartsByConnectorNameService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>
  ) {}

  async run(command: ListDataMartsByConnectorNameCommand): Promise<DataMartDto[]> {
    const dataMarts = await this.dataMartRepo.find({
      where: { projectId: command.projectId, definitionType: DataMartDefinitionType.CONNECTOR },
    });

    return dataMarts
      .filter(dm => {
        if (!dm.definition || dm.definitionType !== DataMartDefinitionType.CONNECTOR) {
          return false;
        }
        const connectorDef = dm.definition as unknown as ConnectorDefinition;
        return connectorDef?.connector?.source?.name === command.connectorName;
      })
      .map(dm => this.mapper.toDomainDto(dm));
  }
}
