import { setAtPath } from '../manifestPath';
import { createEmptyManifest, type BuilderManifest } from '../manifest.types';
import { BuilderActionType, type BuilderAction, type BuilderState } from './types';

export const initialBuilderState: BuilderState = {
  id: null,
  manifest: createEmptyManifest(),
  versions: [],
  activeVersionId: null,
  activeVersion: null,
  loadedVersion: null,
  dirty: false,
  saving: false,
  publishing: false,
  error: null,
  sample: null,
};

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case BuilderActionType.SET_MANIFEST:
      return { ...state, manifest: action.payload, dirty: false };
    case BuilderActionType.SET_PATH:
      return {
        ...state,
        manifest: setAtPath<BuilderManifest>(
          state.manifest,
          action.payload.path,
          action.payload.value
        ),
        dirty: true,
      };
    case BuilderActionType.REMOVE_PARAMETER: {
      const params = Object.fromEntries(
        Object.entries(state.manifest.parameters).filter(([k]) => k !== action.payload)
      );
      return { ...state, manifest: { ...state.manifest, parameters: params }, dirty: true };
    }
    case BuilderActionType.REMOVE_NODE: {
      const nodes = Object.fromEntries(
        Object.entries(state.manifest.nodes).filter(([k]) => k !== action.payload)
      );
      return { ...state, manifest: { ...state.manifest, nodes }, dirty: true };
    }
    case BuilderActionType.SET_META:
      return {
        ...state,
        id: action.payload.id,
        versions: action.payload.versions,
        activeVersionId: action.payload.activeVersionId,
        activeVersion: action.payload.activeVersion,
        loadedVersion: action.payload.loadedVersion,
      };
    case BuilderActionType.SET_DIRTY:
      return { ...state, dirty: action.payload };
    case BuilderActionType.SET_SAVING:
      return { ...state, saving: action.payload };
    case BuilderActionType.SET_PUBLISHING:
      return { ...state, publishing: action.payload };
    case BuilderActionType.SET_ERROR:
      return { ...state, error: action.payload };
    case BuilderActionType.SET_SAMPLE:
      return { ...state, sample: action.payload };
    default:
      return state;
  }
}
