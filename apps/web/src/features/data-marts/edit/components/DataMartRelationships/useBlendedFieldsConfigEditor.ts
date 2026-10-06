import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import type { DataMartResponseDto } from '../../../shared';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type {
  BlendedFieldOverride,
  BlendedFieldsConfig,
  BlendedSource,
} from '../../../shared/types/relationship.types';
import { cleanBlendedFieldOverride } from './blended-field-override.utils';
import type { SourceEntry } from './source-entries';

const DEFAULT_BLENDED_FIELDS_CONFIG: BlendedFieldsConfig = { sources: [] };

interface UseBlendedFieldsConfigEditorOptions {
  /** The Data Mart whose blended fields config is edited — the root of every join path in it. */
  dataMartId: string;
  /** The config as the server last returned it. A new value replaces the local copy. */
  savedConfig: BlendedFieldsConfig | null | undefined;
  /** Receives the response of the newest save: the Data Mart as the server now stores it. */
  onSaved: (response: DataMartResponseDto) => void;
}

/**
 * Local, optimistic copy of a Data Mart's blended fields config plus the per-join edits the
 * Report Fields and Description tabs make to it: output alias, "Allow for reporting", per-join
 * description override and per-field overrides.
 */
export function useBlendedFieldsConfigEditor({
  dataMartId,
  savedConfig,
  onSaved,
}: UseBlendedFieldsConfigEditorOptions) {
  const confirmedConfig = savedConfig ?? DEFAULT_BLENDED_FIELDS_CONFIG;
  const [localConfig, setLocalConfig] = useState<BlendedFieldsConfig>(confirmedConfig);
  const localConfigRef = useRef(localConfig);
  useEffect(() => {
    localConfigRef.current = localConfig;
  }, [localConfig]);

  useEffect(() => {
    setLocalConfig(confirmedConfig);
  }, [confirmedConfig]);

  // Config saves are whole-document PUTs fired from debounced editors (alias, description,
  // field overrides), so two of them can otherwise be in flight at once and land out of
  // order — an older config would then win. One request at a time: while one is in flight the
  // newest config waits its turn, and intermediate ones are dropped because each PUT already
  // carries the complete config.
  const isSavingConfigRef = useRef(false);
  const queuedConfigRef = useRef<BlendedFieldsConfig | null>(null);
  const savedConfigRef = useRef(confirmedConfig);
  savedConfigRef.current = confirmedConfig;

  const runConfigSaveRef = useRef<(config: BlendedFieldsConfig) => void>(() => {
    /* replaced each render below */
  });
  runConfigSaveRef.current = (config: BlendedFieldsConfig) => {
    isSavingConfigRef.current = true;
    void dataMartRelationshipService
      .updateBlendedFieldsConfig(dataMartId, config, { skipLoadingIndicator: true })
      .then(response => {
        // A newer config is already queued — only the last response describes the saved state.
        if (queuedConfigRef.current) return;
        onSaved(response);
      })
      .catch(() => {
        toast.error('Failed to save changes');
        // The optimistic value must not keep looking saved: fall back to the last state the
        // server confirmed, unless a newer edit is already on its way.
        if (!queuedConfigRef.current) {
          setLocalConfig(savedConfigRef.current);
          localConfigRef.current = savedConfigRef.current;
        }
      })
      .finally(() => {
        isSavingConfigRef.current = false;
        const queued = queuedConfigRef.current;
        if (queued) {
          queuedConfigRef.current = null;
          runConfigSaveRef.current(queued);
        }
      });
  };

  const saveConfigAndRefresh = useCallback((newConfig: BlendedFieldsConfig) => {
    setLocalConfig(newConfig);
    // Kept in step synchronously: back-to-back edits read this ref to build the next config,
    // and the effect that mirrors state into it runs only after the re-render.
    localConfigRef.current = newConfig;
    if (isSavingConfigRef.current) {
      queuedConfigRef.current = newConfig;
      return;
    }
    runConfigSaveRef.current(newConfig);
  }, []);

  const updateSourceConfig = useCallback(
    (path: string, updater: (current: BlendedSource | undefined) => BlendedSource) => {
      const currentConfig = localConfigRef.current;
      const existingSources = currentConfig.sources.filter(s => s.path !== path);
      const currentSource = currentConfig.sources.find(s => s.path === path);
      saveConfigAndRefresh({
        ...currentConfig,
        sources: [...existingSources, updater(currentSource)],
      });
    },
    [saveConfigAndRefresh]
  );

  const onAliasChange = useCallback(
    (source: SourceEntry, alias: string) => {
      updateSourceConfig(source.aliasPath, current => ({
        path: source.aliasPath,
        alias,
        ...(current?.isExcluded ? { isExcluded: true } : {}),
        ...(current?.description ? { description: current.description } : {}),
        ...(current?.fields ? { fields: current.fields } : {}),
      }));
    },
    [updateSourceConfig]
  );

  const onHideForReportingChange = useCallback(
    (aliasPath: string, alias: string, isHidden: boolean) => {
      updateSourceConfig(aliasPath, current => ({
        path: aliasPath,
        alias,
        ...(isHidden && { isExcluded: true }),
        ...(current?.description ? { description: current.description } : {}),
        ...(current?.fields && { fields: current.fields }),
      }));
    },
    [updateSourceConfig]
  );

  // An all-whitespace override is a cleared one: the key is removed so the join falls back
  // to the inherited relationship-level description.
  const onDescriptionOverrideChange = useCallback(
    (source: SourceEntry, description: string) => {
      updateSourceConfig(source.aliasPath, current => ({
        path: source.aliasPath,
        alias: current?.alias ?? source.alias,
        ...(current?.isExcluded ? { isExcluded: true } : {}),
        ...(description.trim() !== '' ? { description } : {}),
        ...(current?.fields ? { fields: current.fields } : {}),
      }));
    },
    [updateSourceConfig]
  );

  const onFieldOverrideChange = useCallback(
    (source: SourceEntry, fieldName: string, override: Partial<BlendedFieldOverride>) => {
      updateSourceConfig(source.aliasPath, current => {
        const currentFields = current?.fields ?? {};
        const merged: BlendedFieldOverride = {
          ...(currentFields[fieldName] ?? {}),
          ...override,
        };

        const cleanOverride = cleanBlendedFieldOverride(merged);

        const newFields: Record<string, BlendedFieldOverride> = {};
        for (const [key, val] of Object.entries(currentFields)) {
          if (key !== fieldName) newFields[key] = val;
        }
        if (Object.keys(cleanOverride).length > 0) {
          newFields[fieldName] = cleanOverride;
        }

        return {
          path: source.aliasPath,
          alias: current?.alias ?? source.alias,
          ...(current?.isExcluded ? { isExcluded: true } : {}),
          ...(current?.description ? { description: current.description } : {}),
          ...(Object.keys(newFields).length > 0 ? { fields: newFields } : {}),
        };
      });
    },
    [updateSourceConfig]
  );

  return {
    localConfig,
    /** Always the newest local config, also between a save and the re-render it causes. */
    localConfigRef,
    onAliasChange,
    onHideForReportingChange,
    onDescriptionOverrideChange,
    onFieldOverrideChange,
  };
}
