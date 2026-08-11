import type { BuilderManifest } from '../manifest.types';
import type { CustomConnectorVersionSummaryDto } from '../../api/types';

export enum BuilderActionType {
  SET_MANIFEST = 'SET_MANIFEST',
  SET_PATH = 'SET_PATH',
  REMOVE_PARAMETER = 'REMOVE_PARAMETER',
  REMOVE_NODE = 'REMOVE_NODE',
  SET_META = 'SET_META',
  SET_DIRTY = 'SET_DIRTY',
  SET_SAVING = 'SET_SAVING',
  SET_PUBLISHING = 'SET_PUBLISHING',
  SET_ERROR = 'SET_ERROR',
  SET_SAMPLE = 'SET_SAMPLE',
}

export type BuilderAction =
  | { type: BuilderActionType.SET_MANIFEST; payload: BuilderManifest }
  | { type: BuilderActionType.SET_PATH; payload: { path: (string | number)[]; value: unknown } }
  | { type: BuilderActionType.REMOVE_PARAMETER; payload: string }
  | { type: BuilderActionType.REMOVE_NODE; payload: string }
  | {
      type: BuilderActionType.SET_META;
      payload: {
        id: string | null;
        versions: CustomConnectorVersionSummaryDto[];
        activeVersionId: string | null;
        activeVersion: number | null;
        loadedVersion: number | null;
      };
    }
  | { type: BuilderActionType.SET_DIRTY; payload: boolean }
  | { type: BuilderActionType.SET_SAVING; payload: boolean }
  | { type: BuilderActionType.SET_PUBLISHING; payload: boolean }
  | { type: BuilderActionType.SET_ERROR; payload: string | null }
  | {
      type: BuilderActionType.SET_SAMPLE;
      payload: { node: string; records: Record<string, unknown>[] };
    };

export interface BuilderState {
  id: string | null;
  manifest: BuilderManifest;
  versions: CustomConnectorVersionSummaryDto[];
  activeVersionId: string | null;
  activeVersion: number | null;
  loadedVersion: number | null;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  error: string | null;
  sample: { node: string; records: Record<string, unknown>[] } | null;
}

export interface BuilderContextValue {
  state: BuilderState;
  dispatch: React.Dispatch<BuilderAction>;
}
