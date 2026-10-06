import type {
  AvailableSource,
  BlendedField,
  BlendedFieldsConfig,
} from '../../../shared/types/relationship.types';

/** One joined Data Mart as the Report Fields tab edits it: its fields and per-join overrides. */
export interface SourceEntry {
  aliasPath: string;
  title: string;
  alias: string;
  depth: number;
  fieldCount: number;
  overrideCount: number;
  isIncluded: boolean;
  fields: BlendedField[];
  dataMartId: string;
  /** Per-join description override stored for this node; absent → inherits the relationship's. */
  descriptionOverride?: string;
}

export function buildSourceList(
  availableSources: AvailableSource[],
  blendedFields: BlendedField[],
  config: BlendedFieldsConfig
): SourceEntry[] {
  const fieldsByPath = new Map<string, BlendedField[]>();
  for (const field of blendedFields) {
    const existing = fieldsByPath.get(field.aliasPath);
    if (existing) {
      existing.push(field);
    } else {
      fieldsByPath.set(field.aliasPath, [field]);
    }
  }

  return availableSources.map(src => {
    const configSource = config.sources.find(s => s.path === src.aliasPath);
    const overrideCount = configSource?.fields
      ? Object.values(configSource.fields).filter(
          v =>
            v.isHidden !== undefined ||
            v.aggregateFunction !== undefined ||
            v.alias !== undefined ||
            v.postJoinAggregations !== undefined
        ).length
      : 0;

    return {
      aliasPath: src.aliasPath,
      title: src.title,
      alias: configSource?.alias ?? src.defaultAlias,
      depth: src.depth - 1,
      fieldCount: src.fieldCount,
      overrideCount,
      isIncluded: src.isIncluded,
      fields: fieldsByPath.get(src.aliasPath) ?? [],
      dataMartId: src.dataMartId,
      descriptionOverride: configSource?.description,
    };
  });
}
