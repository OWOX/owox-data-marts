import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StorageResourceLeafDto } from '../../../../../../data-storage/shared/api/types';
import { StorageResourceTree } from './StorageResourceTree';

const PROJECT = 'my-project';

function leaf(
  groupId: string,
  id: string,
  location: string,
  locationMismatch: boolean
): StorageResourceLeafDto {
  return {
    id,
    groupId,
    type: 'TABLE',
    fullyQualifiedName: `${PROJECT}.${groupId}.${id}`,
    location,
    locationMismatch,
  };
}

const RESOURCES = [
  leaf('eu_dataset', 'orders', 'EU', false),
  leaf('us_dataset', 'ads', 'US', true),
];

async function renderAndExpand(props: Partial<Parameters<typeof StorageResourceTree>[0]> = {}) {
  render(
    <StorageResourceTree
      namespaces={[{ id: PROJECT }]}
      namespacesLoading={false}
      namespacesError={null}
      onRetryNamespaces={vi.fn()}
      loadNamespaceResources={() => Promise.resolve(RESOURCES)}
      {...props}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: PROJECT }));
  fireEvent.click(await screen.findByRole('button', { name: /eu_dataset/ }));
  fireEvent.click(screen.getByRole('button', { name: /us_dataset/ }));
}

function resourceRow(id: string): HTMLElement {
  const row = screen.getByText(id).closest('button');
  if (!row) throw new Error(`No row for ${id}`);
  return row;
}

describe('StorageResourceTree location', () => {
  it('shows each dataset location and marks the ones outside the storage location', async () => {
    await renderAndExpand();

    expect(screen.getByRole('button', { name: /eu_dataset/ })).toHaveTextContent('EU');
    expect(screen.getByRole('button', { name: /eu_dataset/ })).not.toHaveTextContent(
      'different location'
    );
    expect(screen.getByRole('button', { name: /us_dataset/ })).toHaveTextContent(
      'US · different location'
    );
  });

  it('keeps a resource outside the storage location from being ticked', async () => {
    const onToggleResource = vi.fn();
    await renderAndExpand({ selectionMode: 'multi', selectedFqns: new Set(), onToggleResource });

    const mismatched = resourceRow('ads');
    expect(mismatched).toHaveAttribute('aria-disabled', 'true');
    // Stays natively enabled so the hover explanation still shows.
    expect(mismatched).not.toBeDisabled();
    expect(mismatched.title).toContain('Stored in US');
    fireEvent.click(mismatched);
    expect(onToggleResource).not.toHaveBeenCalled();

    fireEvent.click(resourceRow('orders'));
    expect(onToggleResource).toHaveBeenCalledWith(RESOURCES[0]);
  });

  it('keeps a resource outside the storage location from being picked', async () => {
    const onSelectResource = vi.fn();
    await renderAndExpand({ onSelectResource });

    fireEvent.click(resourceRow('ads'));
    expect(onSelectResource).not.toHaveBeenCalled();

    fireEvent.click(resourceRow('orders'));
    expect(onSelectResource).toHaveBeenCalledWith(RESOURCES[0]);
  });
});
