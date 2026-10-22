import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectPluginSchedule } from '../../../features/plugins';
import { ScheduleSidePanel } from './ScheduleSidePanel';

const schedule = (over: Partial<ProjectPluginSchedule> = {}): ProjectPluginSchedule => ({
  id: 's1',
  name: 'Morning export',
  action: 'export',
  cron: '0 9 * * *',
  timeZone: 'Europe/Kyiv',
  enabled: true,
  disabledReason: null,
  nextRunAt: '2026-10-18T06:00:00.000Z',
  lastRun: null,
  createdAt: '2026-10-16T10:00:00.000Z',
  modifiedAt: '2026-10-16T10:00:00.000Z',
  pluginId: 'p1',
  pluginName: 'Sheets Sync',
  installationId: 'i1',
  installationState: 'installed',
  owner: null,
  ownerIsMember: true,
  canManage: true,
  ...over,
});

function renderPanel(item: ProjectPluginSchedule) {
  return render(
    <MemoryRouter>
      <ScheduleSidePanel
        schedule={item}
        disabled={false}
        pluginHref='/plugins/p1'
        runsHref='/?tab=runs'
        onClose={vi.fn()}
        onChange={vi.fn()}
        onDelete={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('ScheduleSidePanel', () => {
  it('shows the summary of a describable cron and the zone name, not the cron', () => {
    renderPanel(schedule());

    expect(screen.getByText('Daily at 09:00')).toBeInTheDocument();
    expect(screen.queryByText('0 9 * * *')).toBeNull();
    expect(screen.getByText(/Kyiv/)).toBeInTheDocument();
  });

  it('shows only the cron when it cannot be described', () => {
    renderPanel(schedule({ cron: '0 9 * * 1-5' }));

    expect(screen.getByText('0 9 * * 1-5')).toBeInTheDocument();
    expect(screen.queryByText(/^Daily|^Every|^Weekly|^Monthly/)).toBeNull();
  });

  it.each([
    [true, 'Pause'],
    [false, 'Resume'],
  ])('with enabled %s offers %s and Delete to a manager', (enabled, label) => {
    renderPanel(schedule({ enabled }));

    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('offers neither Pause nor Delete without canManage', () => {
    renderPanel(schedule({ canManage: false }));

    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('offers Delete but no Pause or Resume and no Open plugin for a removed plugin', () => {
    renderPanel(schedule({ installationState: 'uninstalled' }));

    expect(screen.queryByRole('button', { name: /^(Pause|Resume)$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open plugin' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('says a locked owner is treated as one who left, in the stop hint', () => {
    renderPanel(schedule());

    fireEvent.click(screen.getByRole('button', { name: 'Why would a schedule stop?' }));

    expect(
      screen.getByText(
        /While its owner is not a project member or their account is locked, it skips its runs\./
      )
    ).toBeInTheDocument();
  });

  it('says why an enabled schedule whose owner left does not run', () => {
    renderPanel(schedule({ ownerIsMember: false }));

    expect(
      screen.getByText(
        'The owner is no longer a project member, or their account is locked, so its runs are skipped'
      )
    ).toBeInTheDocument();
  });
});
