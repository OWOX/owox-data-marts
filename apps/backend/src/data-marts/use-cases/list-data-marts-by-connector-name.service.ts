import { Injectable } from '@nestjs/common';
import { DataMartService } from '../services/data-mart.service';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ListDataMartsByConnectorNameCommand } from '../dto/domain/list-data-mart-by-connector-name';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { RoleScope } from '../enums/role-scope.enum';
import { ContextAccessService } from '../services/context/context-access.service';

@Injectable()
export class ListDataMartsByConnectorNameService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    private readonly contextAccessService: ContextAccessService
  ) {}

  async run(command: ListDataMartsByConnectorNameCommand): Promise<DataMartDto[]> {
    const dataMarts = await this.dataMartService.findByProjectIdAndDefinitionType(
      command.projectId,
      DataMartDefinitionType.CONNECTOR
    );

    const matchingDataMarts = dataMarts.filter(dm => {
      if (!dm.definition || dm.definitionType !== DataMartDefinitionType.CONNECTOR) {
        return false;
      }
      const connectorDef = dm.definition as unknown as ConnectorDefinition;
      return connectorDef?.connector?.source?.name === command.connectorName;
    });
    if (matchingDataMarts.length === 0) return [];

    // The list shows each configuration, so only Data Marts the member can open are listed,
    // by the Data Marts list's rule: one role scope, one query.
    const roleScope: RoleScope = command.roles.includes('admin')
      ? RoleScope.ENTIRE_PROJECT
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);
    const visible = new Set(
      await this.dataMartService.findVisibleIdsByProjectIdAndIds(
        command.projectId,
        matchingDataMarts.map(dm => dm.id),
        { userId: command.userId, roles: command.roles, roleScope }
      )
    );
    return matchingDataMarts
      .filter(dm => visible.has(dm.id))
      .map(dm => this.mapper.toDomainDto(dm));
  }
}
