import { Injectable } from '@nestjs/common';
import { AiInsightsToolsRegistrar } from '../../../common/ai-insights/services/ai-insights-tools-registrar';
import { DataMartInsightsAgentLoopContext } from '../ai-insights-types';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import {
  DataMartSampleDataService,
  SampleTableDataResult,
} from '../../services/data-mart-sample-data.service';
import { z } from 'zod';

export enum DataMartsAiInsightsTools {
  SAMPLE_TABLE_DATA = 'schema_sample_table_data',
}

const SampleTableDataInputSchema = z.object({
  columns: z
    .array(z.string().min(1))
    .min(1)
    .describe('Column names to sample from the data mart table.'),
});
type SampleTableDataInput = z.infer<typeof SampleTableDataInputSchema>;

@Injectable()
export class DataMartsAiInsightsToolsRegistrar implements AiInsightsToolsRegistrar {
  constructor(private readonly dataMartSampleDataService: DataMartSampleDataService) {}

  registerTools(registry: ToolRegistry): void {
    registry.register({
      name: DataMartsAiInsightsTools.SAMPLE_TABLE_DATA,
      description:
        'Get sample values for specific columns from the data mart table. ' +
        'Use this to understand actual data format, allowed values, or structure ' +
        'of string-typed columns before choosing parsing/casting transforms.',
      inputJsonSchema: {
        type: 'object',
        properties: {
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Column names to sample.',
          },
        },
        required: ['columns'],
        additionalProperties: false,
      },
      inputZod: SampleTableDataInputSchema,
      execute: async (
        args: SampleTableDataInput,
        context: DataMartInsightsAgentLoopContext
      ): Promise<SampleTableDataResult> => {
        return this.dataMartSampleDataService.sampleColumns(
          context.dataMartId,
          context.projectId,
          args.columns,
          context.prefetch?.fullyQualifiedTableName
        );
      },
      isFinal: false,
    });
  }
}
