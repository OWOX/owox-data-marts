import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextDetailsSheet } from './ContextDetailsSheet';

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('../../../idp/hooks/useAuthState', () => ({
  useUser: () => ({ projectId: 'project' }),
}));
vi.mock('../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project${path}` }),
}));
vi.mock('../../../../shared/components/DescriptionEditor/useDescriptionPreview', () => ({
  useDescriptionPreview: () => ({ html: '<h1>Revenue</h1>', loading: false, error: null }),
}));

describe('Context read-only sharing', () => {
  it('shows the description and sharing actions without edit or membership controls', () => {
    render(
      <ContextDetailsSheet
        isOpen
        readOnly
        members={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        context={{
          id: 'context-1',
          name: 'Revenue',
          description: '# Revenue',
          createdAt: '',
          modifiedAt: '',
          createdById: null,
          createdByUser: null,
        }}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Revenue' })).toBeInTheDocument();
    expect(screen.getByTitle('Description')).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('<h1>Revenue</h1>')
    );
    expect(screen.getByRole('button', { name: 'Copy link to context' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy as Markdown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand description' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit description' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Assigned members')).not.toBeInTheDocument();
  });
});
