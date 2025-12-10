'use client';

import React, { useState } from 'react';
import { popoverItems } from '../../../components/ContentPopovers/items';
import { FloatingPopover } from './FloatingPopover';
import { FloatingPopoverContext } from './FloatingPopoverContext';
import type { PopoverId } from './FloatingPopoverContext';

export function FloatingPopoverProvider({ children }: { children: React.ReactNode }) {
  const [activePopoverId, setActivePopoverId] = useState<PopoverId | null>(null);

  const openPopover = (id: PopoverId) => {
    setActivePopoverId(id);
  };

  const closePopover = (id: PopoverId) => {
    if (activePopoverId === id) setActivePopoverId(null);
  };

  const value = { activePopoverId, openPopover, closePopover };

  const popoverConfig = activePopoverId ? popoverItems[activePopoverId] : null;

  return (
    <FloatingPopoverContext.Provider value={value}>
      {children}

      {popoverConfig && (
        <FloatingPopover
          width={popoverConfig.width}
          height={popoverConfig.height}
          position={popoverConfig.position}
        >
          {(() => {
            const Content = popoverConfig.content;
            return <Content />;
          })()}
        </FloatingPopover>
      )}
    </FloatingPopoverContext.Provider>
  );
}
