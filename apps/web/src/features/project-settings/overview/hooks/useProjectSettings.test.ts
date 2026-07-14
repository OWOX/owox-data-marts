import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectSettingsApiService } from '../services';
import { useProjectSettings } from './useProjectSettings';

vi.mock('../services', () => ({
  projectSettingsApiService: {
    getSettings: vi.fn(),
    updateDescription: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useProjectSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not expose the previous project description when the next load fails', async () => {
    vi.mocked(projectSettingsApiService.getSettings)
      .mockResolvedValueOnce({ description: 'First project context' })
      .mockRejectedValueOnce(new Error('Failed to load second project'));

    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string }) => useProjectSettings(projectId),
      { initialProps: { projectId: 'project-1' } }
    );

    await waitFor(() => {
      expect(result.current.settings.description).toBe('First project context');
    });

    rerender({ projectId: 'project-2' });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load second project');
    });
    expect(result.current.settings.description).toBeNull();
  });

  it('ignores an update response after switching projects', async () => {
    vi.mocked(projectSettingsApiService.getSettings)
      .mockResolvedValueOnce({ description: 'First project context' })
      .mockResolvedValueOnce({ description: 'Second project context' });

    let resolveUpdate: (settings: { description: string | null }) => void = () => undefined;
    vi.mocked(projectSettingsApiService.updateDescription).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpdate = resolve;
        })
    );

    const { result, rerender } = renderHook(
      ({ projectId }: { projectId: string }) => useProjectSettings(projectId),
      { initialProps: { projectId: 'project-1' } }
    );

    await waitFor(() => {
      expect(result.current.settings.description).toBe('First project context');
    });

    let updatePromise: Promise<void>;
    act(() => {
      updatePromise = result.current.updateDescription('Updated first project context');
    });
    rerender({ projectId: 'project-2' });

    await waitFor(() => {
      expect(result.current.settings.description).toBe('Second project context');
    });

    await act(async () => {
      resolveUpdate({ description: 'Updated first project context' });
      await updatePromise;
    });

    expect(result.current.settings.description).toBe('Second project context');
  });
});
