import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dataMartRelationshipService } from '../../services/data-mart-relationship.service';
import { useBlendableSchema } from '../useBlendableSchema';

vi.mock('../../services/data-mart-relationship.service', () => ({
  dataMartRelationshipService: {
    getBlendableSchema: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useBlendableSchema', () => {
  beforeEach(() => {
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockReset();
    vi.mocked(dataMartRelationshipService.getBlendableSchema).mockResolvedValue({
      nativeFields: [],
      blendedFields: [],
      availableSources: [],
    });
  });

  it('omits request params for the report-safe default', async () => {
    renderHook(() => useBlendableSchema('dm-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(dataMartRelationshipService.getBlendableSchema).toHaveBeenCalledWith(
        'dm-1',
        undefined,
        { skipLoadingIndicator: true }
      );
    });
  });

  it('passes the draft-target opt-in', async () => {
    renderHook(() => useBlendableSchema('dm-1', { includeDraftTargets: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(dataMartRelationshipService.getBlendableSchema).toHaveBeenCalledWith(
        'dm-1',
        { includeDraftTargets: true },
        { skipLoadingIndicator: true }
      );
    });
  });
});
