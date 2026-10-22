import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { usePluginSchedulesParams } from './usePluginSchedulesParams';

const read = (url: string) =>
  renderHook(() => usePluginSchedulesParams(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    ),
  }).result.current;

describe('usePluginSchedulesParams', () => {
  it('opens All Schedules with nothing chosen', () => {
    const params = read('/');

    expect(params.tab).toBe('schedules');
    expect(params.schedule).toBeNull();
    expect(params.run).toBeNull();
    expect(params.plugin).toBeNull();
    expect(params.statuses).toEqual([]);
    expect(params.source).toBeNull();
    expect(params.owner).toBeNull();
  });

  it('reads every parameter, with a repeated status as a list', () => {
    const params = read(
      '/?tab=runs&schedule=s1&run=r1&plugin=p1&status=FAILED&status=QUEUED&source=page&owner=u1'
    );

    expect(params).toMatchObject({
      tab: 'runs',
      schedule: 's1',
      run: 'r1',
      plugin: 'p1',
      statuses: ['FAILED', 'QUEUED'],
      source: 'page',
      owner: 'u1',
    });
  });

  it('treats an unknown tab as All Schedules', () => {
    expect(read('/?tab=nope').tab).toBe('schedules');
  });

  it('links a tab keeping the plugin and owner and dropping the rest', () => {
    const { href } = read(
      '/?tab=runs&schedule=s1&run=r1&plugin=p1&status=FAILED&source=page&owner=u1'
    );

    expect(href('schedules')).toBe('?plugin=p1&owner=u1');
    expect(href('runs')).toBe('?tab=runs&plugin=p1&owner=u1');
    expect(href('runs', { schedule: 's2', run: 'r2' })).toBe(
      '?tab=runs&schedule=s2&run=r2&plugin=p1&owner=u1'
    );
  });
});
