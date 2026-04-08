import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '@owox/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
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
import { SourceConfigDialog } from './SourceConfigDialog';

const BLENDING_BEHAVIOUR_LABELS: Record<BlendingBehaviour, string> = {
  AUTO_BLEND_ALL: 'Auto blend including transient',
  BLEND_DIRECT_ONLY: 'Blend direct relations only',
  MANUAL: 'Manual management',
};

const DEFAULT_CONFIG: BlendedFieldsConfig = {
  blendingBehaviour: 'AUTO_BLEND_ALL',
  sources: [],
};

interface SourceEntry {
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
}

function buildSourceTree(
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
          v => v.isHidden !== undefined || v.aggregateFunction !== undefined || v.alias !== undefined
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

export function BlendedSourcesSubsection({ dataMartId }: BlendedSourcesSubsectionProps) {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const config: BlendedFieldsConfig = dataMart?.blendedFieldsConfig ?? DEFAULT_CONFIG;

  const [isExpanded, setIsExpanded] = useState(false);
  const [schema, setSchema] = useState<BlendableSchema | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dialogSource, setDialogSource] = useState<SourceEntry | null>(null);
  const [localConfig, setLocalConfig] = useState<BlendedFieldsConfig>(config);

  useEffect(() => {
    setLocalConfig(dataMart?.blendedFieldsConfig ?? DEFAULT_CONFIG);
  }, [dataMart?.blendedFieldsConfig]);

  const fetchSchema = () => {
    if (!dataMartId) return;
    setIsLoading(true);
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
  }, [dataMartId]);

  const sourceTree = useMemo(() => {
    if (!schema) return [];
    return buildSourceTree(schema.availableSources ?? [], schema.blendedFields, localConfig);
  }, [schema, localConfig]);

  const includedCount = sourceTree.filter(s => s.isIncluded).length;
  const totalFields = sourceTree
    .filter(s => s.isIncluded)
    .reduce((sum, s) => sum + s.fieldCount, 0);

  const saveConfigAndRefresh = (newConfig: BlendedFieldsConfig) => {
    setLocalConfig(newConfig);
    void dataMartRelationshipService
      .updateBlendedFieldsConfig(dataMartId, newConfig)
      .then(() => {
        fetchSchema();
      });
  };

  const handleBehaviourChange = (value: string) => {
    saveConfigAndRefresh({
      ...localConfig,
      blendingBehaviour: value as BlendingBehaviour,
    });
  };

  const handleIncludeSource = (source: SourceEntry) => {
    const existingSources = localConfig.sources.filter(s => s.path !== source.aliasPath);
    saveConfigAndRefresh({
      ...localConfig,
      sources: [...existingSources, { path: source.aliasPath, alias: source.alias }],
    });
  };

  const handleExcludeSource = (source: SourceEntry) => {
    if (localConfig.blendingBehaviour === 'MANUAL') {
      // In MANUAL: remove from sources[] to exclude
      saveConfigAndRefresh({
        ...localConfig,
        sources: localConfig.sources.filter(s => s.path !== source.aliasPath),
      });
    } else {
      // In AUTO/DIRECT: mark isExcluded
      const existingSources = localConfig.sources.filter(s => s.path !== source.aliasPath);
      saveConfigAndRefresh({
        ...localConfig,
        sources: [
          ...existingSources,
          { path: source.aliasPath, alias: source.alias, isExcluded: true },
        ],
      });
    }
  };

  const handleSourceSave = (
    source: SourceEntry,
    update: { alias: string; isExcluded?: boolean; fields?: Record<string, BlendedFieldOverride> }
  ) => {
    const existingSources = localConfig.sources.filter(s => s.path !== source.aliasPath);
    const updatedSource = {
      path: source.aliasPath,
      alias: update.alias,
      ...(update.isExcluded ? { isExcluded: true } : {}),
      ...(update.fields ? { fields: update.fields } : {}),
    };
    saveConfigAndRefresh({
      ...localConfig,
      sources: [...existingSources, updatedSource],
    });
  };

  return (
    <div className='mt-8 border-t border-gray-200 dark:border-white/8'>
      <div className='flex items-center gap-2 pt-4'>
        <button
          type='button'
          className='-ml-3 flex flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/40'
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

          {!isLoading && sourceTree.length === 0 && (
            <p className='text-muted-foreground py-3 text-sm'>
              No related data marts found. Add relationships first.
            </p>
          )}

          {!isLoading && sourceTree.length > 0 && (
            <div className='border'>
              {sourceTree.map(source =>
                source.isIncluded ? (
                  <button
                    key={source.aliasPath}
                    type='button'
                    className='bg-background flex w-full cursor-pointer items-start gap-2 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/40'
                    style={{ paddingLeft: `${source.depth * 16 + 12}px` }}
                    onClick={() => {
                      setDialogSource(source);
                    }}
                  >
                    {source.depth > 0 && (
                      <span className='text-muted-foreground mt-px text-xs'>{'\u21B3'}</span>
                    )}
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-sm font-medium'>{source.title}</div>
                      <div className='text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs'>
                        <span className='font-mono'>{source.alias}</span>
                        <span>·</span>
                        <span>
                          {source.fieldCount} {source.fieldCount === 1 ? 'field' : 'fields'}
                        </span>
                        {source.overrideCount > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {source.overrideCount}{' '}
                              {source.overrideCount === 1 ? 'override' : 'overrides'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {localConfig.blendingBehaviour !== 'AUTO_BLEND_ALL' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            role='button'
                            className='text-muted-foreground hover:text-destructive mt-0.5 shrink-0'
                            onClick={e => {
                              e.stopPropagation();
                              handleExcludeSource(source);
                            }}
                          >
                            <X className='h-4 w-4' />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Exclude from blending</TooltipContent>
                      </Tooltip>
                    )}
                  </button>
                ) : (
                  <button
                    key={source.aliasPath}
                    type='button'
                    className='flex w-full cursor-pointer items-start gap-2 border-b px-3 py-2.5 text-left opacity-50 transition-colors last:border-b-0 hover:bg-muted/40 hover:opacity-70'
                    style={{ paddingLeft: `${source.depth * 16 + 12}px` }}
                    onClick={() => {
                      setDialogSource(source);
                    }}
                  >
                    {source.depth > 0 && (
                      <span className='text-muted-foreground mt-px text-xs'>{'\u21B3'}</span>
                    )}
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-sm'>{source.title}</div>
                      <div className='text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs'>
                        <span className='font-mono'>{source.alias}</span>
                        <span>·</span>
                        <span>
                          {source.fieldCount} {source.fieldCount === 1 ? 'field' : 'fields'}
                        </span>
                      </div>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='mt-0.5 h-6 shrink-0 cursor-pointer gap-1 px-2 text-xs opacity-100'
                          onClick={e => {
                            e.stopPropagation();
                            handleIncludeSource(source);
                          }}
                        >
                          <Plus className='h-3.5 w-3.5' />
                          Include
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Include this source in blending</TooltipContent>
                    </Tooltip>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}

      {dialogSource && (
        <SourceConfigDialog
          open={true}
          onOpenChange={open => {
            if (!open) setDialogSource(null);
          }}
          source={{
            path: dialogSource.aliasPath,
            title: dialogSource.title,
            currentAlias: dialogSource.alias,
            isExcluded: !dialogSource.isIncluded,
            fields: dialogSource.fields.map(f => ({
              name: f.originalFieldName,
              type: f.type,
              alias: f.alias,
              description: f.description,
              isHidden: f.isHidden,
              aggregateFunction: f.aggregateFunction,
            })),
          }}
          onSave={update => {
            handleSourceSave(dialogSource, update);
          }}
        />
      )}
    </div>
  );
}
