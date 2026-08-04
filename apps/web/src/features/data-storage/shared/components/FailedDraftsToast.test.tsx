import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FailedDraftsToast } from './FailedDraftsToast';

describe('FailedDraftsToast', () => {
  it('states the shared reason and links to the filtered drafts list when all failures match', () => {
    const { container } = render(
      <MemoryRouter>
        <FailedDraftsToast
          triggerId='trigger-1'
          projectId='project-1'
          storageTitle='My BigQuery'
          failures={[
            { dataMartId: 'dm-1', title: 'My Draft', error: 'Data Mart has no definition' },
            { dataMartId: 'dm-2', title: 'Other Draft', error: 'Data Mart has no definition' },
          ]}
        />
      </MemoryRouter>
    );

    expect(container.textContent).toContain(
      'Failed to publish 2 Data Mart drafts: Data Mart has no definition.'
    );

    const link = screen.getByRole('link', { name: 'Check them' });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('/ui/project-1/data-marts?')).toBe(true);
    const filters: unknown = JSON.parse(
      new URLSearchParams(href.split('?')[1]).get('filters') ?? '[]'
    );
    expect(filters).toEqual([
      { f: 'storageTitle', o: 'eq', v: ['My BigQuery'] },
      { f: 'status', o: 'eq', v: ['DRAFT'] },
    ]);
  });

  it('says "due to different errors" when failures have mixed reasons', () => {
    const { container } = render(
      <MemoryRouter>
        <FailedDraftsToast
          triggerId='trigger-1'
          projectId='project-1'
          storageTitle='My BigQuery'
          failures={[
            { dataMartId: 'dm-1', title: 'My Draft', error: 'Data Mart has no definition' },
            { dataMartId: 'dm-2', title: 'Other Draft', error: 'Access denied' },
          ]}
        />
      </MemoryRouter>
    );

    expect(container.textContent).toContain(
      'Failed to publish 2 Data Mart drafts due to different errors.'
    );
  });
});
