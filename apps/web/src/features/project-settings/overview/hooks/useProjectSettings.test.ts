import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectSettingsApiService } from '../services';
import { AxiosError } from 'axios';
import { toast } from 'react-hot-toast';
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
      .mockResolvedValueOnce({ description: 'First project context', revision: 3 })
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

  it('sends the loaded revision and then the newly saved revision', async () => {
    vi.mocked(projectSettingsApiService.getSettings).mockResolvedValue({
      description: 'Old',
      revision: 3,
    });
    vi.mocked(projectSettingsApiService.updateDescription)
      .mockResolvedValueOnce({ description: 'New', revision: 4 })
      .mockResolvedValueOnce({ description: null, revision: 5 });
    const { result } = renderHook(() => useProjectSettings('project-1'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await act(async () => {
      await result.current.updateDescription('New');
    });
    await act(async () => {
      await result.current.updateDescription(null);
    });
    expect(projectSettingsApiService.updateDescription).toHaveBeenNthCalledWith(1, 'New', 3);
    expect(projectSettingsApiService.updateDescription).toHaveBeenNthCalledWith(2, null, 4);
  });

  it('keeps the stale revision after 409 and asks the user to reload instead of silently retrying', async () => {
    vi.mocked(projectSettingsApiService.getSettings).mockResolvedValue({
      description: 'Old',
      revision: 3,
    });
    const conflict = new AxiosError('Conflict');
    conflict.response = { status: 409 } as never;
    vi.mocked(projectSettingsApiService.updateDescription).mockRejectedValue(conflict);
    const { result } = renderHook(() => useProjectSettings('project-1'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await act(async () => {
      await expect(result.current.updateDescription('Local edit')).rejects.toBe(conflict);
    });
    expect(result.current.settings).toEqual({ description: 'Old', revision: 3 });
    expect(projectSettingsApiService.updateDescription).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      'Description changed elsewhere. Reload Project Settings and review the current description before saving again.'
    );
  });

  it('does not save after settings could not be loaded', async () => {
    vi.mocked(projectSettingsApiService.getSettings).mockRejectedValue(new Error('Unavailable'));
    const { result } = renderHook(() => useProjectSettings('project-1'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    await expect(result.current.updateDescription('Local')).rejects.toThrow(
      'Reload Project Settings before saving the description.'
    );
    expect(projectSettingsApiService.updateDescription).not.toHaveBeenCalled();
  });

  it('ignores an old update response after switching away and back to the project', async () => {
    vi.mocked(projectSettingsApiService.getSettings)
      .mockResolvedValueOnce({ description: 'First project context', revision: 3 })
      .mockResolvedValueOnce({ description: 'Second project context', revision: 5 })
      .mockResolvedValueOnce({ description: 'Current first project context', revision: 7 });

    let resolveUpdate: (settings: { description: string | null; revision: number }) => void = () =>
      undefined;
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

    rerender({ projectId: 'project-1' });
    await waitFor(() => {
      expect(result.current.settings.description).toBe('Current first project context');
    });

    await act(async () => {
      resolveUpdate({ description: 'Updated first project context', revision: 4 });
      await updatePromise;
    });

    expect(result.current.settings).toEqual({
      description: 'Current first project context',
      revision: 7,
    });
  });
});
