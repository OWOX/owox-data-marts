import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScheduleDisplay } from './ScheduleDisplay';

describe('ScheduleDisplay', () => {
  it('displays a UTC daily schedule without changing its stored identifier', () => {
    render(<ScheduleDisplay cronExpression='0 9 * * *' timeZone='UTC' />);

    expect(screen.getByText('Daily at 09:00')).toBeInTheDocument();
    expect(screen.getByText('UTC')).toBeInTheDocument();
  });

  it('uses the modern Kyiv spelling for a compatible Europe/Kiev schedule', () => {
    render(<ScheduleDisplay cronExpression='0 9 * * *' timeZone='Europe/Kiev' />);

    expect(screen.getByText('Europe/Kyiv')).toBeInTheDocument();
    expect(screen.queryByText('Europe/Kiev')).not.toBeInTheDocument();
  });
});
