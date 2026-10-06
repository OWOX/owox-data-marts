import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { Input } from '@owox/ui/components/input';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';

// A fixed toast id collapses repeated copy requests (e.g. from a plugin) into a single toast.
const LINK_COPIED_TOAST_ID = 'plugin-link-copied';

export function useCopyLink(): {
  copyLink: (url: string) => Promise<void>;
  fallbackDialog: ReactNode;
} {
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  /** Held from the start of a copy until it is confirmed or its fallback dialog closes. */
  const busyRef = useRef(false);

  const copyLink = useCallback(async (url: string) => {
    // A click inside the plugin frame activates this document too; older browsers lack the API.
    const { userActivation } = navigator as Partial<Navigator>;
    if (busyRef.current || (userActivation && !userActivation.isActive)) {
      throw new Error('The link was not copied');
    }
    busyRef.current = true;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', { id: LINK_COPIED_TOAST_ID });
      busyRef.current = false;
    } catch {
      setFallbackUrl(url);
    }
  }, []);

  const fallbackDialog = (
    <Dialog
      open={fallbackUrl !== null}
      onOpenChange={open => {
        if (!open) {
          setFallbackUrl(null);
          busyRef.current = false;
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy this link</DialogTitle>
          <DialogDescription>
            Your browser did not allow copying. Copy the link below.
          </DialogDescription>
        </DialogHeader>
        <Input
          readOnly
          value={fallbackUrl ?? ''}
          aria-label='Link'
          autoFocus
          onFocus={event => {
            event.currentTarget.select();
          }}
        />
      </DialogContent>
    </Dialog>
  );

  return { copyLink, fallbackDialog };
}
