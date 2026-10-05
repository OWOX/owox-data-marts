import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BuilderNavRail, type BuilderSelection } from './BuilderNavRail';
import { createEmptyManifest, createEmptyNode } from '../../shared/model/manifest.types';

function manifestWithNode(name: string) {
  const m = createEmptyManifest();
  m.nodes[name] = createEmptyNode();
  return m;
}

describe('BuilderNavRail', () => {
  it('renders global sections and streams, and reports selection', () => {
    const onSelect = vi.fn();
    const onAddNode = vi.fn();
    const selection: BuilderSelection = { kind: 'global', section: 'general' };
    render(
      <BuilderNavRail
        manifest={manifestWithNode('users')}
        selection={selection}
        onSelect={onSelect}
        onAddNode={onAddNode}
      />
    );

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Authentication'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'global', section: 'authentication' });

    fireEvent.click(screen.getByText('users'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'node', name: 'users' });
  });

  it('adds a node via the Streams add row', () => {
    const onAddNode = vi.fn();
    render(
      <BuilderNavRail
        manifest={createEmptyManifest()}
        selection={{ kind: 'global', section: 'general' }}
        onSelect={vi.fn()}
        onAddNode={onAddNode}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'orders' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    expect(onAddNode).toHaveBeenCalledWith('orders');
  });

  it('does not add a duplicate node name', () => {
    const onAddNode = vi.fn();
    render(
      <BuilderNavRail
        manifest={manifestWithNode('users')}
        selection={{ kind: 'global', section: 'general' }}
        onSelect={vi.fn()}
        onAddNode={onAddNode}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Node name'), { target: { value: 'users' } });
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    expect(onAddNode).not.toHaveBeenCalled();
    expect(screen.getByText('A node named "users" already exists')).toBeInTheDocument();
  });

  // Authors type the endpoint here; the engine refused such a name only when a test ran.
  it('does not add a node named like an API path, and says what to type instead', () => {
    const onAddNode = vi.fn();
    render(
      <BuilderNavRail
        manifest={createEmptyManifest()}
        selection={{ kind: 'global', section: 'general' }}
        onSelect={vi.fn()}
        onAddNode={onAddNode}
      />
    );
    const input = screen.getByPlaceholderText('Node name');
    fireEvent.change(input, { target: { value: 'v1/balance/history' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAddNode).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert').textContent).toContain('v1_balance_history');

    fireEvent.change(input, { target: { value: 'v1_balance_history' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    expect(onAddNode).toHaveBeenCalledWith('v1_balance_history');
  });
});
