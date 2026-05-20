import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportColumnPicker } from '../ReportColumnPicker';

vi.mock('../../../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    getBlendableSchema: vi.fn(),
  },
}));

import { dataMartRelationshipService } from '../../../../shared/services/data-mart-relationship.service';

const NATIVE_SCHEMA = {
  nativeFields: [
    { name: 'id', type: 'STRING' },
    { name: 'name', type: 'STRING' },
  ],
  blendedFields: [],
  availableSources: [],
};

function renderPicker(
  value: string[] | null,
  onChange = vi.fn(),
  extraProps: Record<string, unknown> = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportColumnPicker dataMartId='dm-1' value={value} onChange={onChange} {...extraProps} />
    </QueryClientProvider>
  );
}

describe('ReportColumnPicker — orphan section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dataMartRelationshipService.getBlendableSchema as ReturnType<typeof vi.fn>).mockResolvedValue(
      NATIVE_SCHEMA
    );
  });

  it('shows orphan section when value contains a name absent from schema', async () => {
    renderPicker(['id', 'orphan_col']);

    await waitFor(() => {
      expect(screen.getByText(/Inaccessible columns \(1\)/)).toBeInTheDocument();
    });
    expect(screen.getByText('orphan_col')).toBeInTheDocument();
  });

  it('orphan section is open by default', async () => {
    renderPicker(['orphan_col']);

    await waitFor(() => {
      expect(screen.getByText(/Inaccessible columns/)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/You no longer have access to the data marts these columns come from/)
    ).toBeVisible();
  });

  it('Remove button calls onChange filtering out the orphan name', async () => {
    const onChange = vi.fn();
    renderPicker(['id', 'orphan_col'], onChange);

    await waitFor(() => {
      expect(screen.getByLabelText('Remove orphan_col')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Remove orphan_col'));

    expect(onChange).toHaveBeenCalledWith(['id']);
  });

  it('onOrphanCountChange fires with correct count', async () => {
    const onOrphanCountChange = vi.fn();
    renderPicker(['id', 'ghost_a', 'ghost_b'], vi.fn(), { onOrphanCountChange });

    await waitFor(() => {
      expect(onOrphanCountChange).toHaveBeenCalledWith(2);
    });
  });

  it('allSelected is false when only orphans are in value', async () => {
    renderPicker(['orphan_only']);

    await waitFor(() => {
      expect(screen.getByLabelText(/Select all fields|Deselect all fields/)).toBeInTheDocument();
    });

    const masterCheckbox = screen.getByLabelText(/Select all fields|Deselect all fields/);
    expect(masterCheckbox).not.toBeChecked();
  });
});
