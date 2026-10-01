import { describe, it, expect } from 'vitest';
import { builderReducer, initialBuilderState } from './reducer';
import { BuilderActionType } from './types';
import { createEmptyManifest } from '../manifest.types';

describe('builderReducer', () => {
  it('SET_MANIFEST replaces the manifest and clears dirty', () => {
    const m = { ...createEmptyManifest(), name: 'Loaded' };
    const s = builderReducer(
      { ...initialBuilderState, dirty: true },
      {
        type: BuilderActionType.SET_MANIFEST,
        payload: m,
      }
    );
    expect(s.manifest.name).toBe('Loaded');
    expect(s.dirty).toBe(false);
  });

  it('SET_PATH updates a manifest path and marks dirty', () => {
    const s = builderReducer(initialBuilderState, {
      type: BuilderActionType.SET_PATH,
      payload: { path: ['baseUrl'], value: 'https://api.example.com' },
    });
    expect(s.manifest.baseUrl).toBe('https://api.example.com');
    expect(s.dirty).toBe(true);
  });

  it('SET_PATH can set a nested parameter and marks dirty', () => {
    const s = builderReducer(initialBuilderState, {
      type: BuilderActionType.SET_PATH,
      payload: {
        path: ['parameters', 'Token'],
        value: { requiredType: 'string', isRequired: true },
      },
    });
    expect(s.manifest.parameters.Token).toEqual({ requiredType: 'string', isRequired: true });
    expect(s.dirty).toBe(true);
  });

  it('REMOVE_PARAMETER deletes a parameter and marks dirty', () => {
    const start = builderReducer(initialBuilderState, {
      type: BuilderActionType.SET_PATH,
      payload: {
        path: ['parameters', 'Token'],
        value: { requiredType: 'string', isRequired: true },
      },
    });
    const s = builderReducer(start, { type: BuilderActionType.REMOVE_PARAMETER, payload: 'Token' });
    expect(s.manifest.parameters.Token).toBeUndefined();
    expect(s.dirty).toBe(true);
  });

  it('SET_META stores id/versions/active and leaves dirty unchanged', () => {
    const s = builderReducer(
      { ...initialBuilderState, dirty: true },
      {
        type: BuilderActionType.SET_META,
        payload: {
          id: 'def-1',
          versions: [{ version: 1, status: 'draft', publishedAt: null }],
          activeVersionId: null,
          activeVersion: null,
          loadedVersion: 1,
        },
      }
    );
    expect(s.id).toBe('def-1');
    expect(s.versions).toHaveLength(1);
    expect(s.dirty).toBe(true);
  });

  it('REMOVE_NODE deletes a node and marks dirty', () => {
    const start = builderReducer(initialBuilderState, {
      type: BuilderActionType.SET_PATH,
      payload: {
        path: ['nodes', 'items'],
        value: {
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: [] },
          fields: {},
        },
      },
    });
    const s = builderReducer(start, { type: BuilderActionType.REMOVE_NODE, payload: 'items' });
    expect(s.manifest.nodes.items).toBeUndefined();
    expect(s.dirty).toBe(true);
  });

  it('SET_PATH sets and clears authentication', () => {
    const apiKey = {
      type: 'apiKey',
      inject: { into: 'query', name: 'k', format: '{{ parameters.X }}' },
    };
    const set = builderReducer(initialBuilderState, {
      type: BuilderActionType.SET_PATH,
      payload: { path: ['authentication'], value: apiKey },
    });
    expect(set.manifest.authentication).toEqual(apiKey);
    const cleared = builderReducer(set, {
      type: BuilderActionType.SET_PATH,
      payload: { path: ['authentication'], value: undefined },
    });
    expect(cleared.manifest.authentication).toBeUndefined();
  });

  it('SET_SAMPLE stores the sample without marking dirty', () => {
    const next = builderReducer(initialBuilderState, {
      type: BuilderActionType.SET_SAMPLE,
      payload: { node: 'items', records: [{ id: 1 }] },
    });
    expect(next.sample).toEqual({ node: 'items', records: [{ id: 1 }] });
    expect(next.dirty).toBe(false);
  });

  it('MARK_SAVED clears dirty only while the state still holds the saved manifest', () => {
    const edited = builderReducer(initialBuilderState, {
      type: BuilderActionType.SET_PATH,
      payload: { path: ['name'], value: 'Saved' },
    });
    const saved = edited.manifest;

    expect(
      builderReducer(edited, { type: BuilderActionType.MARK_SAVED, payload: saved }).dirty
    ).toBe(false);

    const editedDuringSave = builderReducer(edited, {
      type: BuilderActionType.SET_PATH,
      payload: { path: ['baseUrl'], value: 'https://api.example.org' },
    });
    expect(
      builderReducer(editedDuringSave, { type: BuilderActionType.MARK_SAVED, payload: saved }).dirty
    ).toBe(true);
  });
});

// Where the manifest of a new connector came from: the strongest sign wins, and opening or
// starting a connector clears it.
describe('builderReducer — manifest origin', () => {
  const after = (...origins: ('form' | 'code' | 'import')[]) =>
    origins.reduce(
      (state, payload) =>
        builderReducer(state, { type: BuilderActionType.SET_MANIFEST_ORIGIN, payload }),
      initialBuilderState
    ).manifestOrigin;

  it('starts as form', () => {
    expect(initialBuilderState.manifestOrigin).toBe('form');
  });

  it('becomes code on a Code-mode edit, and stays import after an import', () => {
    expect(after('code')).toBe('code');
    expect(after('import', 'code')).toBe('import');
    expect(after('code', 'import')).toBe('import');
  });

  it('goes back to form when a connector is started or opened', () => {
    expect(after('import', 'form')).toBe('form');
  });
});
