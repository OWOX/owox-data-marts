import { useEffect, useRef } from 'react';
import { isPlayerPlayMessage } from '../model/player-events';
import { trackWhatsNewEvent } from '../model/whats-new.analytics';

interface ReleaseVideoProps {
  src: string;
  version: string;
  /** The chapter the player was started from, or null from the beginning. */
  chapter: string | null;
}

/**
 * The release video player. Reports `whats_new_video_played` the first time the video starts,
 * whether from the player's own play button or a chapter's autoplay; a picked chapter remounts
 * the player and can report again.
 */
export function ReleaseVideo({ src, version, chapter }: ReleaseVideoProps) {
  const playerRef = useRef<HTMLIFrameElement>(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    const playerOrigin = new URL(src).origin;
    const handleMessage = (event: MessageEvent) => {
      if (reportedRef.current) return;
      if (event.source !== playerRef.current?.contentWindow) return;
      if (event.origin !== playerOrigin || !isPlayerPlayMessage(event.data)) return;
      reportedRef.current = true;
      trackWhatsNewEvent('whats_new_video_played', version, { chapter });
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [src, version, chapter]);

  return (
    <iframe
      ref={playerRef}
      src={src}
      title={`What's new in OWOX Data Marts ${version}`}
      className='aspect-video w-full rounded-md border-none'
      allow='accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;'
      allowFullScreen
    />
  );
}
