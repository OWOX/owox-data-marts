import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TargetDataMartPicker } from '../TargetDataMartPicker';

vi.mock('../../../../../../shared/components/Combobox/combobox', () => ({
  Combobox: ({
    onValueChange,
    placeholder,
  }: {
    onValueChange: (v: string) => void;
    placeholder: string;
  }) => (
    <button
      data-testid='combobox'
      aria-label={placeholder}
      onClick={() => {
        onValueChange('dm-target');
      }}
    >
      {placeholder}
    </button>
  ),
}));

vi.mock('../../../../shared', () => ({
  dataMartService: {
    getDataMarts: vi.fn(),
    getDataMartById: vi.fn(),
  },
}));

vi.mock('../../../../shared/services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    createRelationship: vi.fn(),
  },
}));

vi.mock('../../../../../../shared/utils', () => ({
  showApiErrorToast: vi.fn(),
  generateUniqueAlias: vi.fn(() => 'target-dm'),
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('../../../../../../utils/string-utils', () => ({
  generateUniqueAlias: vi.fn(() => 'target-dm'),
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
}));

import { dataMartService } from '../../../../shared';
import { dataMartRelationshipService } from '../../../../shared/services/data-mart-relationship.service';
import { showApiErrorToast } from '../../../../../../shared/utils';

const BASE_DM = { id: 'dm-source', title: 'Source DM', storage: { title: 'BQ' } };
const TARGET_DM = { id: 'dm-target', title: 'Target DM', storage: { title: 'BQ' } };

describe('TargetDataMartPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dataMartService.getDataMarts as ReturnType<typeof vi.fn>).mockResolvedValue([
      BASE_DM,
      TARGET_DM,
    ]);
    (dataMartService.getDataMartById as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_DM);
  });

  it('shows error toast and clears list when getDataMarts rejects', async () => {
    const loadError = new Error('Network Error');
    (dataMartService.getDataMarts as ReturnType<typeof vi.fn>).mockRejectedValue(loadError);

    render(
      <TargetDataMartPicker
        dataMartId='dm-source'
        storageId='s-1'
        existingRelationships={[]}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(showApiErrorToast).toHaveBeenCalledWith(loadError, 'Failed to load data marts');
    });

    expect(screen.getByTestId('combobox')).toBeInTheDocument();
  });

  it('shows backend message toast on 403 from createRelationship', async () => {
    const apiError = Object.assign(new Error('You do not have permission'), {
      response: { status: 403, data: { message: 'You do not have permission' } },
    });
    (dataMartRelationshipService.createRelationship as ReturnType<typeof vi.fn>).mockRejectedValue(
      apiError
    );

    render(
      <TargetDataMartPicker
        dataMartId='dm-source'
        storageId='s-1'
        existingRelationships={[]}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('combobox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('combobox'));

    await waitFor(() => {
      expect(showApiErrorToast).toHaveBeenCalledWith(apiError, 'Failed to add relationship');
    });
  });

  it('shows fallback message toast on network error from createRelationship', async () => {
    const networkError = new Error('Network Error');
    (dataMartRelationshipService.createRelationship as ReturnType<typeof vi.fn>).mockRejectedValue(
      networkError
    );

    render(
      <TargetDataMartPicker
        dataMartId='dm-source'
        storageId='s-1'
        existingRelationships={[]}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('combobox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('combobox'));

    await waitFor(() => {
      expect(showApiErrorToast).toHaveBeenCalledWith(networkError, 'Failed to add relationship');
    });
  });
});
