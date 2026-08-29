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
  SET_CODE_INVALID = 'SET_CODE_INVALID',
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
    }
  | { type: BuilderActionType.SET_CODE_INVALID; payload: boolean };

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
  /**
   * Code mode is holding text that does not parse as JSON.
   *
   * Lives here rather than in the editor because it has to outlive it: the editor's buffer
   * is local state that the Builder/Code switch unmounts, and the two things that must know
   * about an unparseable buffer — the Save/Publish buttons, and the switch itself — are
   * mounted outside it.
   */
  codeInvalid: boolean;
}

export interface BuilderContextValue {
  state: BuilderState;
  dispatch: React.Dispatch<BuilderAction>;
}
