import { useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useBuilderContext } from '../context/useBuilderContext';
import { BuilderActionType, type BuilderState } from '../context/types';
import { ConnectorBuilderApiService } from '../../api/connector-builder-api.service';
import { createEmptyManifest, createEmptyNode, type BuilderManifest } from '../manifest.types';
import { blankToNull, firstNonEmpty } from '../asText';
import { apiErrorMessage } from '../../../../../app/api/extract-api-error.util';

/**
 * The draft version a save from here would destroy, or null when nothing is at risk.
 *
 * `saveDraft` PUTs the manifest alone, and the server writes it into the newest DRAFT row
 * in place — it is never told which version the author opened. So reading an older version
 * to compare, tweaking it and saving replaces the newest draft's content with the older
 * one's, and there is no copy of what was there. A published newest version is not at risk:
 * that save opens a new version instead of overwriting one, which is why this narrows to
 * drafts rather than to "not the newest".
 *
 * `versions` is oldest-first (the detail endpoint orders by version ASC), the same
 * assumption `loadConnector` and the version popover already make.
 */
export function draftVersionAtRisk(
  state: Pick<BuilderState, 'versions' | 'loadedVersion'>
): number | null {
  const latest = state.versions.at(-1);
  if (latest?.status !== 'draft') return null;
  if (state.loadedVersion === null || state.loadedVersion >= latest.version) return null;
  return latest.version;
}

export function useBuilder() {
  const { state, dispatch } = useBuilderContext();

  const setPath = useCallback(
    (path: (string | number)[], value: unknown) => {
      dispatch({ type: BuilderActionType.SET_PATH, payload: { path, value } });
    },
    [dispatch]
  );

  const setManifest = useCallback(
    (next: BuilderManifest) => {
      dispatch({ type: BuilderActionType.SET_MANIFEST, payload: next });
      dispatch({ type: BuilderActionType.SET_DIRTY, payload: true });
    },
    [dispatch]
  );

  const setCodeInvalid = useCallback(
    (invalid: boolean) => {
      dispatch({ type: BuilderActionType.SET_CODE_INVALID, payload: invalid });
    },
    [dispatch]
  );

  const setSample = useCallback(
    (node: string, records: Record<string, unknown>[]) => {
      dispatch({ type: BuilderActionType.SET_SAMPLE, payload: { node, records } });
    },
    [dispatch]
  );

  const removeParameter = useCallback(
    (name: string) => {
      dispatch({ type: BuilderActionType.REMOVE_PARAMETER, payload: name });
    },
    [dispatch]
  );

  const addNode = useCallback(
    (name: string) => {
      dispatch({
        type: BuilderActionType.SET_PATH,
        payload: { path: ['nodes', name], value: createEmptyNode() },
      });
    },
    [dispatch]
  );
  const removeNode = useCallback(
    (name: string) => {
      dispatch({ type: BuilderActionType.REMOVE_NODE, payload: name });
    },
    [dispatch]
  );
  // Duplicate a node under a unique "<name>_copy" key (deep-cloned). Returns the new name.
  const cloneNode = useCallback(
    (name: string): string | null => {
      if (!(name in state.manifest.nodes)) return null;
      const src = state.manifest.nodes[name];
      let target = `${name}_copy`;
      let i = 2;
      while (target in state.manifest.nodes) target = `${name}_copy_${i++}`;
      const clone = JSON.parse(JSON.stringify(src)) as typeof src;
      dispatch({
        type: BuilderActionType.SET_PATH,
        payload: { path: ['nodes', target], value: clone },
      });
      return target;
    },
    [dispatch, state.manifest.nodes]
  );
  // Rename a node's key in place (preserving order). Returns the trimmed new name, or
  // null when it is empty, unchanged, the source is missing, or the target already exists.
  const renameNode = useCallback(
    (oldName: string, rawNew: string): string | null => {
      const newName = rawNew.trim();
      const nodes = state.manifest.nodes;
      if (!newName || newName === oldName || !(oldName in nodes) || newName in nodes) return null;
      const next: typeof nodes = {};
      for (const [k, v] of Object.entries(nodes)) next[k === oldName ? newName : k] = v;
      dispatch({ type: BuilderActionType.SET_PATH, payload: { path: ['nodes'], value: next } });
      return newName;
    },
    [dispatch, state.manifest.nodes]
  );

  const initNew = useCallback(() => {
    dispatch({ type: BuilderActionType.SET_MANIFEST, payload: createEmptyManifest() });
    dispatch({
      type: BuilderActionType.SET_META,
      payload: {
        id: null,
        versions: [],
        activeVersionId: null,
        activeVersion: null,
        loadedVersion: null,
      },
    });
  }, [dispatch]);

  const loadConnector = useCallback(
    async (id: string, version?: number) => {
      const api = new ConnectorBuilderApiService();
      try {
        const detail = await api.getById(id);
        // .at() is typed as possibly-undefined, unlike a bare index, so the
        // "no versions yet" fallback below is visible to the type checker.
        const latest = detail.versions.at(-1);
        const targetVersion = version ?? latest?.version ?? 1;
        const v = await api.getVersion(id, targetVersion);
        dispatch({ type: BuilderActionType.SET_MANIFEST, payload: v.manifest });
        dispatch({
          type: BuilderActionType.SET_META,
          payload: {
            id: detail.id,
            versions: detail.versions,
            activeVersionId: detail.activeVersionId,
            activeVersion: detail.activeVersion ?? null,
            loadedVersion: targetVersion,
          },
        });
      } catch (e) {
        dispatch({
          type: BuilderActionType.SET_ERROR,
          payload: apiErrorMessage(e, 'Failed to load connector'),
        });
      }
    },
    [dispatch]
  );

  const saveDraft = useCallback(async (): Promise<string | null> => {
    const api = new ConnectorBuilderApiService();
    dispatch({ type: BuilderActionType.SET_SAVING, payload: true });
    dispatch({ type: BuilderActionType.SET_ERROR, payload: null });
    try {
      const manifest: BuilderManifest = state.manifest;
      if (!state.id) {
        const created = await api.create({
          name: manifest.name,
          title: firstNonEmpty(manifest.title, manifest.name),
          description: manifest.description,
          docUrl: manifest.docUrl,
          manifest,
        });
        // Commit the id before the read below, which only enriches it with version
        // metadata. create() has already taken the name, so a retry that re-POSTs it
        // 400s on the name check — dropping the id with a transient read failure leaves
        // the session holding edits it can never save anywhere.
        dispatch({
          type: BuilderActionType.SET_META,
          payload: {
            id: created.id,
            versions: [],
            activeVersionId: null,
            activeVersion: null,
            loadedVersion: null,
          },
        });
        const detail = await api.getById(created.id);
        dispatch({
          type: BuilderActionType.SET_META,
          payload: {
            id: created.id,
            versions: detail.versions,
            activeVersionId: detail.activeVersionId,
            activeVersion: detail.activeVersion ?? null,
            loadedVersion: detail.versions[detail.versions.length - 1]?.version ?? null,
          },
        });
        dispatch({ type: BuilderActionType.SET_DIRTY, payload: false });
        toast.success('Connector created');
        return created.id;
      }
      await api.saveDraft(state.id, manifest);
      // The manifest's display fields are also columns on the connector row, and the row is
      // what every list, picker and data-mart page reads — this screen is the only one that
      // reads the manifest. Saving the draft alone left a retitled connector titled the old
      // way everywhere else, with no error to explain it.
      //
      // This replaces the read that used to follow saveDraft rather than adding a request:
      // the update returns the same detail payload getById does. Sent on every save rather
      // than only on a change, because the builder holds no copy of what the row currently
      // says and "changed" could only be guessed. `name` is absent — it is what data marts
      // resolve the connector by, which is why the field goes read-only once it exists.
      const detail = await api.updateMetadata(state.id, {
        title: firstNonEmpty(manifest.title, manifest.name),
        description: blankToNull(manifest.description),
        docUrl: blankToNull(manifest.docUrl),
      });
      dispatch({
        type: BuilderActionType.SET_META,
        payload: {
          id: state.id,
          versions: detail.versions,
          activeVersionId: detail.activeVersionId,
          activeVersion: detail.activeVersion ?? null,
          loadedVersion: detail.versions[detail.versions.length - 1]?.version ?? null,
        },
      });
      dispatch({ type: BuilderActionType.SET_DIRTY, payload: false });
      toast.success('Draft saved');
      return state.id;
    } catch (e) {
      const msg = apiErrorMessage(e, 'Failed to save');
      dispatch({ type: BuilderActionType.SET_ERROR, payload: msg });
      toast.error(msg);
      return null;
    } finally {
      dispatch({ type: BuilderActionType.SET_SAVING, payload: false });
    }
  }, [dispatch, state.id, state.manifest]);

  const publish = useCallback(async (): Promise<boolean> => {
    const api = new ConnectorBuilderApiService();
    // Flagged before the save, not after it: on a never-saved connector the save is what
    // creates the connector and assigns its id, and that id is what swaps the route
    // /connectors/builder/new → /:id — a remount that reloads the connector from the
    // server. The flag is what holds that swap back until the published version exists,
    // instead of reloading the draft under a "Published" toast (see ConnectorBuilderPage).
    dispatch({ type: BuilderActionType.SET_PUBLISHING, payload: true });
    dispatch({ type: BuilderActionType.SET_ERROR, payload: null });
    try {
      const id = !state.id || state.dirty ? await saveDraft() : state.id;
      if (!id) return false;
      await api.publish(id);
      const detail = await api.getById(id);
      dispatch({
        type: BuilderActionType.SET_META,
        payload: {
          id,
          versions: detail.versions,
          activeVersionId: detail.activeVersionId,
          activeVersion: detail.activeVersion ?? null,
          loadedVersion: detail.versions[detail.versions.length - 1]?.version ?? null,
        },
      });
      toast.success('Published');
      return true;
    } catch (e) {
      const msg = apiErrorMessage(e, 'Failed to publish');
      dispatch({ type: BuilderActionType.SET_ERROR, payload: msg });
      toast.error(msg);
      return false;
    } finally {
      dispatch({ type: BuilderActionType.SET_PUBLISHING, payload: false });
    }
  }, [dispatch, state.id, state.dirty, saveDraft]);

  const softDelete = useCallback(async (): Promise<boolean> => {
    if (!state.id) return false;
    const api = new ConnectorBuilderApiService();
    try {
      await api.softDelete(state.id);
      toast.success('Connector deleted');
      return true;
    } catch (e) {
      const msg = apiErrorMessage(e, 'Failed to delete connector');
      dispatch({ type: BuilderActionType.SET_ERROR, payload: msg });
      toast.error(msg);
      return false;
    }
  }, [dispatch, state.id]);

  const loadVersion = useCallback(
    async (version: number) => {
      if (!state.id) return;
      await loadConnector(state.id, version);
    },
    [state.id, loadConnector]
  );

  const activateVersion = useCallback(
    async (version: number) => {
      if (!state.id) return;
      const api = new ConnectorBuilderApiService();
      try {
        const res = await api.activateVersion(state.id, version);
        dispatch({
          type: BuilderActionType.SET_META,
          payload: {
            id: state.id,
            versions: state.versions,
            activeVersionId: res.activeVersionId,
            activeVersion: res.activeVersion,
            loadedVersion: state.loadedVersion,
          },
        });
        toast.success(`Version ${version} is now active`);
      } catch (e) {
        const msg = apiErrorMessage(e, 'Failed to activate version');
        dispatch({ type: BuilderActionType.SET_ERROR, payload: msg });
        toast.error(msg);
      }
    },
    [dispatch, state.id, state.versions, state.loadedVersion]
  );

  // Discard unsaved edits and restore the last saved state without a page reload:
  // re-fetch from the server for an existing connector, or reset to an empty manifest
  // for an unsaved one. Both paths clear the dirty flag (via SET_MANIFEST).
  const reset = useCallback(async (): Promise<void> => {
    if (state.id) await loadConnector(state.id);
    else initNew();
    toast.success('Changes discarded');
  }, [state.id, loadConnector, initNew]);

  return {
    state,
    manifest: state.manifest,
    setPath,
    setManifest,
    setCodeInvalid,
    setSample,
    removeParameter,
    addNode,
    removeNode,
    cloneNode,
    renameNode,
    initNew,
    loadConnector,
    loadVersion,
    activateVersion,
    saveDraft,
    publish,
    softDelete,
    reset,
  };
}
