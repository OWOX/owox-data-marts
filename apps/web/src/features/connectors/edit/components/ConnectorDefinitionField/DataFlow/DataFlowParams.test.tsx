import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataFlowParams } from './DataFlowParams';

describe('DataFlowParams', () => {
  it('renders each param as a label and value, linking when an href is given', () => {
    render(
      <DataFlowParams
        primary={[
          { label: 'Dataset', value: 'raw', href: 'https://console/raw' },
          { label: 'Table', value: 'events' },
        ]}
      />
    );

    expect(screen.getByText('Dataset')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'raw' })).toHaveAttribute(
      'href',
      'https://console/raw'
    );
    expect(screen.getByText('events')).toBeInTheDocument();
  });

  it('adds a copy button only to params with a copy value', () => {
    render(
      <DataFlowParams
        primary={[
          { label: 'Region', value: 'eu' },
          { label: 'Table', value: 'events', copyValue: 'db.events' },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Copy table name' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy region name' })).not.toBeInTheDocument();
  });

  it('hides secondary params behind a "more" toggle', () => {
    render(
      <DataFlowParams
        primary={[{ label: 'Table', value: 'events' }]}
        secondary={[
          { label: 'Region', value: 'eu' },
          { label: 'Database', value: 'db' },
        ]}
      />
    );

    const toggle = screen.getByRole('button', { name: '2 more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Region')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.getByText('db')).toBeInTheDocument();
  });

  it('renders no toggle without secondary params', () => {
    render(<DataFlowParams primary={[{ label: 'Table', value: 'events' }]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
