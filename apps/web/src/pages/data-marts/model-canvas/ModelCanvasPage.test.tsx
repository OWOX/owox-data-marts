// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelCanvasPage from './ModelCanvasPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setStorageId: vi.fn(),
}));

vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ navigate: mocks.navigate, scope: (path: string) => path }),
}));

vi.mock('../../../features/data-storage/shared/model/hooks/useDataStorage', () => ({
  useDataStorage: () => ({ dataStorages: [] }),
}));

vi.mock('../../../features/data-marts/model-canvas/model/use-model-canvas-filters', () => ({
  useModelCanvasFilters: () => ({
    storageId: null,
    setStorageId: mocks.setStorageId,
    status: 'all',
    setStatus: vi.fn(),
    rel: 'all',
    setRel: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
  }),
}));

vi.mock('../../../features/data-marts/model-canvas/components/ModelCanvasView', () => ({
  ModelCanvasView: ({
    onActiveQualityRunChange,
  }: {
    onActiveQualityRunChange?: (active: boolean) => void;
  }) => (
    <>
      <button type='button' onClick={() => onActiveQualityRunChange?.(true)}>
        Report active quality run
      </button>
      <button type='button' onClick={() => onActiveQualityRunChange?.(false)}>
        Report terminal quality run
      </button>
    </>
  ),
}));

describe('ModelCanvasPage Data Quality activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows project Run History while the selected storage has active checks', () => {
    render(
      <MemoryRouter>
        <ModelCanvasPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Report active quality run' }));

    expect(screen.getByRole('status')).toHaveTextContent('Checking data quality');
    fireEvent.click(screen.getByRole('button', { name: 'View runs' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/data-marts/runs');
  });

  it('hides activity when the selected storage has no active checks', () => {
    render(
      <MemoryRouter>
        <ModelCanvasPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Report active quality run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report terminal quality run' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View runs' })).not.toBeInTheDocument();
  });
});
