// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const onDismiss = vi.fn();

vi.mock('./items', () => ({
  popoverItems: {
    'with-dismiss': {
      title: 'With dismiss',
      content: ({ onClose }: { onClose?: () => void }) => (
        <button type='button' onClick={onClose}>
          Done
        </button>
      ),
      onDismiss,
    },
    plain: { title: 'Plain', content: () => <p>Body</p> },
  },
}));
vi.mock('../../app/store/hooks/useContentPopovers', () => ({ useContentPopovers: vi.fn() }));

const { useContentPopovers } = await import('../../app/store/hooks/useContentPopovers');
const { ContentPopovers } = await import('./ContentPopovers');

const close = vi.fn();

function openPopover(id: string) {
  vi.mocked(useContentPopovers).mockReturnValue({
    activePopoverId: id,
    isOpen: true,
    close,
  } as unknown as ReturnType<typeof useContentPopovers>);
}

describe('ContentPopovers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('tells the popover that its × closed it', () => {
    openPopover('with-dismiss');
    render(<ContentPopovers />);

    fireEvent.click(screen.getByTestId('floatingPopoverClose'));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('treats a close from the popover content as a dismissal too', () => {
    openPopover('with-dismiss');
    render(<ContentPopovers />);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes a popover without a dismiss handler', () => {
    openPopover('plain');
    render(<ContentPopovers />);

    fireEvent.click(screen.getByTestId('floatingPopoverClose'));

    expect(close).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
