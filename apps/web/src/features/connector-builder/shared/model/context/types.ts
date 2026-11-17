import type { BuilderManifest } from '../manifest.types';
import type { CustomConnectorVersionSummaryDto } from '../../api/types';

export enum BuilderActionType {
  SET_MANIFEST = 'SET_MANIFEST',
  SET_PATH = 'SET_PATH',
  REMOVE_PARAMETER = 'REMOVE_PARAMETER',
  REMOVE_NODE = 'REMOVE_NODE',
  SET_META = 'SET_META',
  SET_DIRTY = 'SET_DIRTY',
  MARK_SAVED = 'MARK_SAVED',
  SET_SAVING = 'SET_SAVING',
  SET_PUBLISHING = 'SET_PUBLISHING',
  SET_ERROR = 'SET_ERROR',
  SET_SAMPLE = 'SET_SAMPLE',
  SET_CODE_INVALID = 'SET_CODE_INVALID',
  SET_MANIFEST_ORIGIN = 'SET_MANIFEST_ORIGIN',
  SET_LOGO = 'SET_LOGO',
  MARK_LOADED = 'MARK_LOADED',
  MARK_LOGO_SAVED = 'MARK_LOGO_SAVED',
}

/** Where the manifest of a new connector came from, for analytics. */
export type ManifestOrigin = 'form' | 'code' | 'import';

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
  | { type: BuilderActionType.MARK_SAVED; payload: BuilderManifest }
  | { type: BuilderActionType.SET_SAVING; payload: boolean }
  | { type: BuilderActionType.SET_PUBLISHING; payload: boolean }
  | { type: BuilderActionType.SET_ERROR; payload: string | null }
  | {
      type: BuilderActionType.SET_SAMPLE;
      payload: { node: string; records: Record<string, unknown>[] };
    }
  | { type: BuilderActionType.SET_CODE_INVALID; payload: boolean }
  | { type: BuilderActionType.SET_MANIFEST_ORIGIN; payload: ManifestOrigin }
  | { type: BuilderActionType.SET_LOGO; payload: string | null }
  /** The manifest just set and this logo are what the server holds. */
  | { type: BuilderActionType.MARK_LOADED; payload: string | null }
  | { type: BuilderActionType.MARK_LOGO_SAVED; payload: string | null };

export interface BuilderState {
  id: string | null;
  manifest: BuilderManifest;
  versions: CustomConnectorVersionSummaryDto[];
  activeVersionId: string | null;
  activeVersion: number | null;
  loadedVersion: number | null;
  /**
   * The connector's icon as a `data:image/...;base64,` URI. It is on the connector, not in a
   * version's manifest, so Save sends it on its own and it does not wait for Publish.
   */
  logo: string | null;
  savedLogo: string | null;
  /**
   * The manifest the server holds for the open version, by reference. A save writes the
   * manifest only when it differs, so a change to the icon alone adds no version.
   */
  savedManifest: BuilderManifest | null;
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
  /**
   * Where the manifest came from: an import, Code mode or the form. The strongest sign wins,
   * and starting or opening a connector resets it.
   */
  manifestOrigin: ManifestOrigin;
  /**
   * Counts whole-manifest replacements: an open, a Discard, a version open, an import or a
   * Code-mode edit. The form keys its panes on it, because several of their inputs read the
   * manifest only when they mount.
   */
  manifestRevision: number;
}

export interface BuilderContextValue {
  state: BuilderState;
  dispatch: React.Dispatch<BuilderAction>;
  /**
   * Pushes the text Code mode is still holding back on its debounce and returns the manifest
   * it pushed, or null when there was nothing to push. Set while Code mode is mounted.
   */
  codeEdits: React.RefObject<(() => BuilderManifest | null) | null>;
}
