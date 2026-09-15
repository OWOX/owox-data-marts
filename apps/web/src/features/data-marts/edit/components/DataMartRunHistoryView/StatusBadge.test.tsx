// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';
import { DataMartRunStatus } from '../../../shared';

describe('StatusBadge', () => {
  it('renders a live pulse on the running badge', () => {
    const { container } = render(<StatusBadge status={DataMartRunStatus.RUNNING} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(container.querySelector('.animate-ping')).not.toBeNull();
  });

  it('does not render a pulse on a finished badge', () => {
    const { container } = render(<StatusBadge status={DataMartRunStatus.SUCCESS} />);
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(container.querySelector('.animate-ping')).toBeNull();
  });
});
