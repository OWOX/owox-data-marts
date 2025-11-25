import React, { useMemo } from 'react';
import { cn } from '@owox/ui/lib/utils';
import { storageService } from '../../../services';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@owox/ui/components/resizable';

interface ResizableColumnsProps {
  storageKey: string;
  left: React.ReactNode;
  right: React.ReactNode;
  initialRatio?: number;
  minWidth?: number;
  className?: string;
}

/**
 * Two-column resizable layout using shadcn/@owox/ui Resizable components.
 * - Saves/restores column ratio in localStorage using provided storageKey
 */
export function ResizableColumns({
  storageKey,
  left,
  right,
  initialRatio = 0.5,
  minWidth = 240,
  className,
}: ResizableColumnsProps) {
  const ratio = useMemo(() => {
    const saved = storageService.get(storageKey);
    const parsed = Number(saved);
    if (!Number.isNaN(parsed)) return clamp(parsed, 0.1, 0.9);
    return clamp(initialRatio, 0.1, 0.9);
  }, [storageKey, initialRatio]);

  const defaultLeft = Math.round(ratio * 100);
  const defaultRight = 100 - defaultLeft;

  const approxContainer = 1200;
  const minPercent = Math.min(45, Math.max(5, Math.round((minWidth / approxContainer) * 100)));

  function handleLayoutChange(sizes: number[]) {
    const leftSize = sizes[0];
    const newRatio = clamp(leftSize / 100, 0.1, 0.9);
    storageService.set(storageKey, newRatio);
  }

  return (
    <ResizablePanelGroup
      direction='horizontal'
      onLayout={handleLayoutChange}
      className={cn('relative flex h-full w-full items-stretch overflow-hidden', className)}
    >
      <ResizablePanel defaultSize={defaultLeft} minSize={minPercent} className='overflow-auto'>
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={defaultRight} minSize={minPercent} className='overflow-auto'>
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default ResizableColumns;
