import { describe, it, expect, beforeEach } from 'vitest';
import { useReducer } from 'react';
import { render, screen } from '@testing-library/react';
import { NodeEditor } from './NodeEditor';
import { BuilderContext } from '../../../shared/model/context/context';
import { builderReducer, initialBuilderState } from '../../../shared/model/context/reducer';
import type { BuilderState } from '../../../shared/model/context/types';
import { parseManifestJson } from '../../../shared/model/manifestJson';

/**
 * The end-to-end version of the per-editor specs: the whole node pane, nothing mocked, for
 * the node body that white-screened it. The manifest goes through the real
 * `parseManifestJson` (which normalizes only the top level) into the real reducer, so every
 * section editor below `NodeEditor` sees the node exactly as an author's Code-mode paste —
 * or an MCP-authored manifest — leaves it. `CollapsibleCard` collapses with CSS only, so
 * the collapsed sections are mounted too and each one really renders here.
 */
function seed(json: string): BuilderState {
  const parsed = parseManifestJson(json);
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...initialBuilderState, manifest: parsed.manifest };
}

function Harness({ json }: { json: string }) {
  const [state, dispatch] = useReducer(builderReducer, json, seed);
  return (
    <BuilderContext.Provider value={{ state, dispatch }}>
      <NodeEditor
        nodeName='items'
        onRemoved={() => {
          /* selection changes are the page's business, not this spec's */
        }}
      />
    </BuilderContext.Provider>
  );
}

/** Every section the pane mounts for a sync node, by the testid its editor renders. */
const SECTIONS = [
  'node-general-editor',
  'request-editor',
  'query-parameters',
  'record-selector-editor',
  'fields-editor',
  'incremental-editor',
  'pagination-editor',
  'transformations-editor',
  'partition-router-editor',
  'record-filter-editor',
  'error-handler-editor',
];

/** Asserts a section rendered. `getAllBy` because a substream partition router mounts a
 * second `PaginationEditor` for the parent request. */
function expectSection(testId: string) {
  expect(screen.getAllByTestId(testId)[0]).toBeInTheDocument();
}

// Card collapse state is persisted per card name in localStorage, so start each test clean.
beforeEach(() => {
  localStorage.clear();
});

describe('NodeEditor with an unvalidated node body', () => {
  it('renders the whole pane for a node whose only content is an empty recordSelector', () => {
    render(<Harness json='{"nodes":{"items":{"recordSelector":{}}}}' />);

    expect(screen.getByTestId('node-editor-items')).toBeInTheDocument();
    for (const section of SECTIONS) {
      expectSection(section);
    }
  });

  it('renders the whole pane for a node body that is entirely empty', () => {
    render(<Harness json='{"nodes":{"items":{}}}' />);

    expect(screen.getByTestId('node-editor-items')).toBeInTheDocument();
    for (const section of SECTIONS) {
      expectSection(section);
    }
  });

  it('renders the whole pane for a node carrying half-written optional sections', () => {
    // Every "lesser class" shape at once: a partition router with no parent and a record
    // filter with no path. The engine rejects both, but this is what a Code-mode paste
    // looks like halfway through being written.
    render(
      <Harness json='{"nodes":{"items":{"recordSelector":{},"partitionRouter":{"type":"substream","partitionField":"campaign_id"},"recordFilter":{"operator":"isNull"},"errorHandler":{}}}}' />
    );

    expect(screen.getByTestId('node-editor-items')).toBeInTheDocument();
    for (const section of SECTIONS) {
      expectSection(section);
    }
  });
});
