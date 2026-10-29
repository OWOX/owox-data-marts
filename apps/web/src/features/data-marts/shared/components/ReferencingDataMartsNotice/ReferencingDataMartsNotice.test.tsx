import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReferencingDataMartsNotice } from './ReferencingDataMartsNotice';

describe('ReferencingDataMartsNotice', () => {
  it('renders nothing when no Data Mart references this one', () => {
    const { container } = render(
      <ReferencingDataMartsNotice dataMarts={[]} total={0} action='delete' />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names the visible Data Marts and counts the rest', () => {
    render(
      <ReferencingDataMartsNotice
        dataMarts={[{ id: 'a', title: 'Retail orders' }]}
        total={3}
        action='delete'
      />
    );

    expect(screen.getByText('Referenced in the SQL of 3 Data Marts.')).toBeInTheDocument();
    expect(
      screen.getByText('They will stop working once this Data Mart is deleted:')
    ).toBeInTheDocument();
    expect(screen.getByText('Retail orders')).toBeInTheDocument();
    expect(screen.getByText('and 2 Data Marts you don’t have access to')).toBeInTheDocument();
  });

  it('says the check is running instead of showing nothing', () => {
    render(<ReferencingDataMartsNotice dataMarts={[]} total={0} action='delete' isLoading />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking which Data Marts reference this one in their SQL…'
    );
  });

  it('shows a failed check as unknown, not as no references', () => {
    render(<ReferencingDataMartsNotice dataMarts={[]} total={0} action='delete' hasError />);

    expect(
      screen.getByText('Could not check whether other Data Marts reference this one in their SQL.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('If any do, they will stop working once it is deleted.')
    ).toBeInTheDocument();
  });

  it('lists what was found and says the rest could not be checked', () => {
    render(
      <ReferencingDataMartsNotice
        dataMarts={[{ id: 'x', title: 'Retail orders' }]}
        total={1}
        action='delete'
        hasError
      />
    );

    expect(screen.getByText('Retail orders')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Some of the selected Data Marts could not be checked, so more may be affected.'
      )
    ).toBeInTheDocument();
  });

  it('says how many are hidden when none can be named', () => {
    render(<ReferencingDataMartsNotice dataMarts={[]} total={1} action='change' />);

    expect(screen.getByText('Referenced in the SQL of 1 Data Mart.')).toBeInTheDocument();
    expect(screen.getByText('Changing this input source may break them:')).toBeInTheDocument();
    expect(screen.getByText('1 Data Mart you don’t have access to')).toBeInTheDocument();
  });
});
