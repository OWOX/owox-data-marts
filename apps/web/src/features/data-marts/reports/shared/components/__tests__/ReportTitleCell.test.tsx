import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReportTitleCell } from '../ReportTitleCell';

describe('ReportTitleCell', () => {
  it('renders the report title', () => {
    render(<ReportTitleCell title='Monthly Revenue' />);

    expect(screen.getByText('Monthly Revenue')).toBeInTheDocument();
  });

  it('renders quick actions when provided', () => {
    render(
      <ReportTitleCell
        title='Monthly Revenue'
        actions={<button type='button'>Open document</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Open document' })).toBeInTheDocument();
  });
});
