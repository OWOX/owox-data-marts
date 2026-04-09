import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type {
  AvailableSource,
  BlendableSchema,
  BlendedField,
  BlendedFieldOverride,
  BlendedFieldsConfig,
  BlendingBehaviour,
} from '../../../shared/types/relationship.types';
import type { DataMartContextType } from '../../model/context/types';
import { SourceAccordionItem } from './SourceAccordionItem';

const BLENDING_BEHAVIOUR_LABELS: Record<BlendingBehaviour, string> = {
  AUTO_BLEND_ALL: 'Auto blend including transient',
  BLEND_DIRECT_ONLY: 'Blend direct relations only',
  MANUAL: 'Manual management',
};

const DEFAULT_CONFIG: BlendedFieldsConfig = {
  blendingBehaviour: 'AUTO_BLEND_ALL',
  sources: [],
};

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
}

interface BlendedSourcesSubsectionProps {
  dataMartId: string;
  relationshipsVersion?: number;
}

function buildSourceList(
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
            v.isHidden !== undefined || v.aggregateFunction !== undefined || v.alias !== undefined
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
    };
  });
}

export function BlendedSourcesSubsection({
  dataMartId,
  relationshipsVersion,
}: BlendedSourcesSubsectionProps) {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const config: BlendedFieldsConfig = dataMart?.blendedFieldsConfig ?? DEFAULT_CONFIG;

  const [isExpanded, setIsExpanded] = useState(false);
  const [schema, setSchema] = useState<BlendableSchema | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [localConfig, setLocalConfig] = useState<BlendedFieldsConfig>(config);

  useEffect(() => {
    setLocalConfig(dataMart?.blendedFieldsConfig ?? DEFAULT_CONFIG);
  }, [dataMart?.blendedFieldsConfig]);

  const fetchSchema = (showLoading = true) => {
    if (!dataMartId) return;
    if (showLoading) setIsLoading(true);
    dataMartRelationshipService
      .getBlendableSchema(dataMartId)
      .then(result => {
        setSchema(result);
      })
      .catch(() => {
        setSchema(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataMartId, relationshipsVersion]);

  const sourceList = useMemo(() => {
    if (!schema) return [];
    return buildSourceList(schema.availableSources, schema.blendedFields, localConfig);
  }, [schema, localConfig]);

  const includedCount = sourceList.filter(s => s.isIncluded).length;
  const totalFields = sourceList
    .filter(s => s.isIncluded)
    .reduce((sum, s) => sum + s.fieldCount, 0);

  const saveConfigAndRefresh = (newConfig: BlendedFieldsConfig) => {
    setLocalConfig(newConfig);
    void dataMartRelationshipService.updateBlendedFieldsConfig(dataMartId, newConfig).then(() => {
      fetchSchema(false);
    });
  };

  const handleBehaviourChange = (value: string) => {
    saveConfigAndRefresh({
      ...localConfig,
      blendingBehaviour: value as BlendingBehaviour,
    });
  };

  const handleSourceAliasChange = (source: SourceEntry, alias: string) => {
    const existingSources = localConfig.sources.filter(s => s.path !== source.aliasPath);
    const currentSource = localConfig.sources.find(s => s.path === source.aliasPath);
    saveConfigAndRefresh({
      ...localConfig,
      sources: [
        ...existingSources,
        {
          path: source.aliasPath,
          alias,
          ...(currentSource?.isExcluded ? { isExcluded: true } : {}),
          ...(currentSource?.fields ? { fields: currentSource.fields } : {}),
        },
      ],
    });
  };

  const handleSourceHideChange = (source: SourceEntry, isHidden: boolean) => {
    if (isHidden) {
      if (localConfig.blendingBehaviour === 'MANUAL') {
        saveConfigAndRefresh({
          ...localConfig,
          sources: localConfig.sources.filter(s => s.path !== source.aliasPath),
        });
      } else {
        const existingSources = localConfig.sources.filter(s => s.path !== source.aliasPath);
        saveConfigAndRefresh({
          ...localConfig,
          sources: [
            ...existingSources,
            { path: source.aliasPath, alias: source.alias, isExcluded: true },
          ],
        });
      }
    } else {
      const existingSources = localConfig.sources.filter(s => s.path !== source.aliasPath);
      saveConfigAndRefresh({
        ...localConfig,
        sources: [...existingSources, { path: source.aliasPath, alias: source.alias }],
      });
    }
  };

  const handleFieldOverrideChange = (
    source: SourceEntry,
    fieldName: string,
    override: Partial<BlendedFieldOverride>
  ) => {
    const existingSources = localConfig.sources.filter(s => s.path !== source.aliasPath);
    const currentSource = localConfig.sources.find(s => s.path === source.aliasPath);

    const currentFields = currentSource?.fields ?? {};
    const currentFieldOverride = currentFields[fieldName] ?? {};
    const newFieldOverride: BlendedFieldOverride = { ...currentFieldOverride, ...override };

    const cleanOverride: BlendedFieldOverride = {};
    if (newFieldOverride.alias !== undefined && newFieldOverride.alias !== '') {
      cleanOverride.alias = newFieldOverride.alias;
    }
    if (newFieldOverride.isHidden !== undefined) {
      cleanOverride.isHidden = newFieldOverride.isHidden;
    }
    if (newFieldOverride.aggregateFunction !== undefined) {
      cleanOverride.aggregateFunction = newFieldOverride.aggregateFunction;
    }

    const newFields: Record<string, BlendedFieldOverride> = {};
    for (const [key, val] of Object.entries(currentFields)) {
      if (key !== fieldName) newFields[key] = val;
    }
    if (Object.keys(cleanOverride).length > 0) {
      newFields[fieldName] = cleanOverride;
    }

    saveConfigAndRefresh({
      ...localConfig,
      sources: [
        ...existingSources,
        {
          path: source.aliasPath,
          alias: currentSource?.alias ?? source.alias,
          ...(currentSource?.isExcluded ? { isExcluded: true } : {}),
          ...(Object.keys(newFields).length > 0 ? { fields: newFields } : {}),
        },
      ],
    });
  };

  return (
    <div className='mt-8 border-t border-gray-200 dark:border-white/8'>
      <div className='flex items-center gap-2 pt-4'>
        <button
          type='button'
          className='hover:bg-muted/40 -ml-3 flex flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left transition-colors'
          onClick={() => {
            setIsExpanded(prev => !prev);
          }}
        >
          {isExpanded ? (
            <ChevronDown className='text-muted-foreground h-4 w-4 shrink-0' />
          ) : (
            <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
          )}
          <span className='text-sm font-medium'>Blended Sources</span>
          <span className='text-muted-foreground text-sm'>
            {includedCount} {includedCount === 1 ? 'source' : 'sources'} · {totalFields}{' '}
            {totalFields === 1 ? 'field' : 'fields'}
          </span>
        </button>

        <div className='flex shrink-0 items-center gap-1.5'>
          <span className='text-muted-foreground text-xs'>Blending:</span>
          <Select value={localConfig.blendingBehaviour} onValueChange={handleBehaviourChange}>
            <SelectTrigger size='sm' className='w-64'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BLENDING_BEHAVIOUR_LABELS) as BlendingBehaviour[]).map(key => (
                <SelectItem key={key} value={key}>
                  {BLENDING_BEHAVIOUR_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isExpanded && (
        <div className='mt-3 pb-1'>
          {isLoading && (
            <div className='space-y-2'>
              {[1, 2, 3].map(i => (
                <div key={i} className='bg-muted h-10 animate-pulse rounded' />
              ))}
            </div>
          )}

          {!isLoading && sourceList.length === 0 && (
            <p className='text-muted-foreground py-3 text-sm'>
              No related data marts found. Add relationships first.
            </p>
          )}

          {!isLoading && sourceList.length > 0 && (
            <div className='space-y-2'>
              {sourceList.map(source => (
                <SourceAccordionItem
                  key={source.aliasPath}
                  source={source}
                  onAliasChange={alias => {
                    handleSourceAliasChange(source, alias);
                  }}
                  onHideForReportingChange={hidden => {
                    handleSourceHideChange(source, hidden);
                  }}
                  onFieldOverrideChange={(fieldName, override) => {
                    handleFieldOverrideChange(source, fieldName, override);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
