import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { FilterConfig } from '../../dto/schemas/filter-config.schema';
import { SortConfig } from '../../dto/schemas/sort-config.schema';
import { DataMart } from '../../entities/data-mart.entity';
import { BlendableSchemaService } from '../blendable-schema.service';

export interface HttpDataColumnValidationInput {
  selectedColumns: string[];
  filter?: FilterConfig;
  sort?: SortConfig;
}

@Injectable()
export class HttpDataColumnValidator {
  constructor(private readonly blendableSchemaService: BlendableSchemaService) {}

  async validate(dataMart: DataMart, input: HttpDataColumnValidationInput): Promise<void> {
    const schema = await this.blendableSchemaService.computeBlendableSchema(
      dataMart.id,
      dataMart.projectId
    );

    const knownColumns = new Set([
      ...schema.nativeFields.map(field => field.name),
      ...schema.blendedFields.map(field => field.name),
    ]);

    const unknownColumns = Array.from(this.collectReferencedColumns(input)).filter(
      column => !knownColumns.has(column)
    );

    if (unknownColumns.length > 0) {
      throw new BusinessViolationException(
        `Unknown column${unknownColumns.length > 1 ? 's' : ''}: ${unknownColumns.join(', ')}`,
        { columns: unknownColumns }
      );
    }
  }

  private collectReferencedColumns(input: HttpDataColumnValidationInput): Set<string> {
    const referenced = new Set<string>(input.selectedColumns);
    for (const rule of input.filter ?? []) {
      if (rule.placement !== 'pre-join') {
        referenced.add(rule.column);
      }
    }
    for (const rule of input.sort ?? []) {
      referenced.add(rule.column);
    }
    return referenced;
  }
}
