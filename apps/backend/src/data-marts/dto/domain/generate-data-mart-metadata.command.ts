import { DataMartMetadataScope } from '../../ai-insights/ai-insights-types';

export class GenerateDataMartMetadataCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly scope: DataMartMetadataScope,
    public readonly useSample: boolean,
    public readonly fieldName: string | undefined,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
