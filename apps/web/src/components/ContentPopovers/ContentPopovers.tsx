import {
  FloatingPopover,
  FloatingPopoverContent,
  FloatingPopoverHeader,
  FloatingPopoverTitle,
} from '../../shared/components/FloatingPopover';
import { popoverItems } from './items';
import { useContentPopovers } from '../../app/store/hooks/useContentPopovers';
import type { PopoverConfig } from './types';

export function ContentPopovers() {
  const { activePopoverId, isOpen, close } = useContentPopovers();

  if (!isOpen || !activePopoverId) return null;

  const config: PopoverConfig = popoverItems[activePopoverId];
  const {
    width = 500,
    height = 400,
    position = 'center',
    title,
    content: Content,
    onDismiss,
  } = config;
  const dismiss = () => {
    onDismiss?.();
    close();
  };

  return (
    <FloatingPopover width={width} height={height} position={position} onClose={close}>
      <FloatingPopoverHeader onClose={dismiss}>
        {title && <FloatingPopoverTitle>{title}</FloatingPopoverTitle>}
      </FloatingPopoverHeader>
      <FloatingPopoverContent>
        <Content onClose={close} />
      </FloatingPopoverContent>
    </FloatingPopover>
  );
}
