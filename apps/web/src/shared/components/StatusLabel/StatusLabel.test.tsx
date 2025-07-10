import { StatusLabel } from './StatusLabel.tsx';
import { render, screen } from '@testing-library/react';
import { StatusTypeEnum, type StatusVariant } from './types.ts';

describe('StatusLabel Component', () => {
  it('should render', () => {
    render(<StatusLabel>Test label</StatusLabel>);

    expect(screen.getByText('Test label')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders without icon when showIcon is false', () => {
    render(<StatusLabel showIcon={false}>No Icon Label</StatusLabel>);
    expect(screen.getByText('No Icon Label')).toBeInTheDocument();
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
  });

  it.each([
    ['success', StatusTypeEnum.SUCCESS],
    ['error', StatusTypeEnum.ERROR],
    ['warning', StatusTypeEnum.WARNING],
    ['info', StatusTypeEnum.INFO],
    ['neutral', StatusTypeEnum.NEUTRAL],
  ])('renders correct status type: %s', (_, type) => {
    render(<StatusLabel type={type}>Status</StatusLabel>);

    const element = screen.getByText('Status');
    expect(element).toBeInTheDocument();
  });

  it.each<StatusVariant>(['solid', 'subtle', 'outline', 'ghost'])(
    'renders with correct variant: %s',
    variant => {
      render(<StatusLabel variant={variant}>{variant} variant</StatusLabel>);

      const element = screen.getByText(`${variant} variant`);
      expect(element).toBeInTheDocument();
    }
  );

  it('applies custom className', () => {
    const customClass = 'custom-test-class';
    render(<StatusLabel className={customClass}>Custom Class Label</StatusLabel>);

    const element = screen.getByText('Custom Class Label');
    expect(element).toHaveClass(customClass);
    expect(element).toHaveClass('inline-flex', 'items-center', 'gap-1', 'text-sm');
  });

  it('renders children correctly', () => {
    const complexChildren = (
      <>
        <span>First</span>
        <span>Second</span>
      </>
    );

    render(<StatusLabel>{complexChildren}</StatusLabel>);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('combines classes correctly for each status type and variant', () => {
    const { rerender } = render(
      <StatusLabel type={StatusTypeEnum.SUCCESS} variant='solid'>
        Test Label
      </StatusLabel>
    );

    const combinations: [StatusTypeEnum, StatusVariant, string[]][] = [
      [StatusTypeEnum.SUCCESS, 'solid', ['bg-green-500', 'text-white']],
      [StatusTypeEnum.SUCCESS, 'subtle', ['bg-green-50', 'text-green-700']],
      [StatusTypeEnum.SUCCESS, 'outline', ['border-green-500', 'text-green-700']],
      [StatusTypeEnum.SUCCESS, 'ghost', ['text-green-500']],

      [StatusTypeEnum.ERROR, 'solid', ['bg-red-500', 'text-white']],
      [StatusTypeEnum.ERROR, 'subtle', ['bg-red-50', 'text-red-700']],
      [StatusTypeEnum.ERROR, 'outline', ['border-red-500', 'text-red-700']],
      [StatusTypeEnum.ERROR, 'ghost', ['text-red-500']],

      [StatusTypeEnum.WARNING, 'solid', ['bg-yellow-500', 'text-white']],
      [StatusTypeEnum.WARNING, 'subtle', ['bg-yellow-50', 'text-yellow-700']],
      [StatusTypeEnum.WARNING, 'outline', ['border-yellow-500', 'text-yellow-700']],
      [StatusTypeEnum.WARNING, 'ghost', ['text-yellow-500']],

      [StatusTypeEnum.INFO, 'solid', ['bg-blue-500', 'text-white']],
      [StatusTypeEnum.INFO, 'subtle', ['bg-blue-50', 'text-blue-700']],
      [StatusTypeEnum.INFO, 'outline', ['border-blue-500', 'text-blue-700']],
      [StatusTypeEnum.INFO, 'ghost', ['text-blue-500']],

      [StatusTypeEnum.NEUTRAL, 'solid', ['bg-gray-500', 'text-white']],
      [StatusTypeEnum.NEUTRAL, 'subtle', ['bg-gray-50', 'text-gray-700']],
      [StatusTypeEnum.NEUTRAL, 'outline', ['border-gray-500', 'text-gray-700']],
      [StatusTypeEnum.NEUTRAL, 'ghost', ['text-muted-foreground']],
    ];

    let element = screen.getByText('Test Label');
    expect(element).toHaveClass(...combinations[0][2]);

    for (let i = 1; i < combinations.length; i++) {
      const [type, variant, expectedClasses] = combinations[i];

      rerender(
        <StatusLabel type={type} variant={variant}>
          Test Label
        </StatusLabel>
      );

      element = screen.getByText('Test Label');
      expect(element).toHaveClass(...expectedClasses);
    }
  });
});
