import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { AggregationSettingsButton } from './AggregationSettingsButton';

describe('AggregationSettingsButton automatic-aggregation badge', () => {
  const renderButton = (autoAppliedColumns: string[]) =>
    render(
      <TooltipProvider>
        <AggregationSettingsButton
          active
          open={false}
          onClick={vi.fn()}
          count={autoAppliedColumns.length}
          autoAppliedColumns={autoAppliedColumns}
        />
      </TooltipProvider>
    );

  it('announces which fields were aggregated automatically', () => {
    renderButton(['sessions', 'clicks']);

    expect(
      screen.getByText('Automatic aggregations applied for fields: sessions, clicks')
    ).toBeInTheDocument();
    expect(screen.getByTestId('auto-aggregation-dot')).toBeInTheDocument();
  });

  it('dismisses the dot on hover and does not bring it back', () => {
    renderButton(['sessions']);

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Aggregations' }));
    expect(screen.queryByTestId('auto-aggregation-dot')).not.toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Aggregations' }));
    expect(screen.queryByTestId('auto-aggregation-dot')).not.toBeInTheDocument();
  });

  it('gives each mounted button its own note id', () => {
    // A hardcoded id would make `aria-describedby` resolve to the first copy's sentence for both.
    render(
      <TooltipProvider>
        <AggregationSettingsButton
          active
          open={false}
          onClick={vi.fn()}
          autoAppliedColumns={['sessions']}
        />
        <AggregationSettingsButton
          active
          open={false}
          onClick={vi.fn()}
          autoAppliedColumns={['clicks']}
        />
      </TooltipProvider>
    );

    const [first, second] = screen.getAllByRole('button', { name: 'Aggregations' });
    const firstId = first.getAttribute('aria-describedby');
    const secondId = second.getAttribute('aria-describedby');
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
    expect(document.getElementById(firstId!)).toHaveTextContent(
      'Automatic aggregations applied for fields: sessions'
    );
    expect(document.getElementById(secondId!)).toHaveTextContent(
      'Automatic aggregations applied for fields: clicks'
    );
  });

  it('draws nothing when the product aggregated nothing', () => {
    renderButton([]);

    expect(screen.queryByTestId('auto-aggregation-dot')).not.toBeInTheDocument();
    expect(screen.queryByText(/Automatic aggregations/)).not.toBeInTheDocument();
  });
});
