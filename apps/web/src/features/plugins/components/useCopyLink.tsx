import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { Input } from '@owox/ui/components/input';
import { useCallback, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';

// A fixed toast id collapses repeated copy requests (e.g. from a plugin) into a single toast.
const LINK_COPIED_TOAST_ID = 'plugin-link-copied';

export function useCopyLink(): {
  copyLink: (url: string) => Promise<void>;
  fallbackDialog: ReactNode;
} {
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const copyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', { id: LINK_COPIED_TOAST_ID });
    } catch {
      setFallbackUrl(url);
    }
  }, []);

  const fallbackDialog = (
    <Dialog
      open={fallbackUrl !== null}
      onOpenChange={open => {
        if (!open) setFallbackUrl(null);
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
