import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';
import { useReleaseToAnnounce } from '../model/hooks/useReleaseToAnnounce';
import { changelogUrl, formatChapterTime, playerUrl } from '../model/links';
import { trackWhatsNewEvent } from '../model/whats-new.analytics';

export function WhatsNewPopoverTitle() {
  const { release } = useReleaseToAnnounce();
  return <>{release ? `What's new in OWOX Data Marts ${release.version}` : "What's new"}</>;
}

/**
 * The release video with its chapters: picking a chapter plays the video from that scene. The
 * changelog link opens the release's full notes.
 */
export function WhatsNewPopoverContent({ onClose }: { onClose?: () => void }) {
  const { release } = useReleaseToAnnounce();
  const [startTime, setStartTime] = useState<number | null>(null);

  if (!release) return null;
  const { version, videoUrl, chapters } = release;

  return (
    <div className='flex flex-col gap-3' data-testid='whatsNewPopover'>
      <iframe
        key={startTime ?? 'start'}
        src={playerUrl(videoUrl, startTime)}
        title={`What's new in OWOX Data Marts ${version}`}
        className='aspect-video w-full rounded-md border-none'
        allow='accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;'
        allowFullScreen
      />

      {chapters.length > 0 && (
        <ul className='flex flex-col' aria-label='Chapters'>
          {chapters.map(chapter => (
            <li key={`${chapter.startTime}-${chapter.title}`}>
              <button
                type='button'
                className={cn(
                  'flex w-full items-baseline gap-3 rounded-md px-2 py-1 text-left text-sm',
                  'hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                  startTime === chapter.startTime && 'bg-accent'
                )}
                onClick={() => {
                  setStartTime(chapter.startTime);
                  trackWhatsNewEvent('whats_new_chapter_played', version, {
                    chapter: chapter.title,
                  });
                }}
              >
                <span className='text-muted-foreground w-9 shrink-0 tabular-nums'>
                  {formatChapterTime(chapter.startTime)}
                </span>
                <span>{chapter.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className='flex items-center gap-2'>
        <Button size='sm' asChild>
          <a
            href={changelogUrl(version)}
            target='_blank'
            rel='noopener noreferrer'
            onClick={() => {
              trackWhatsNewEvent('whats_new_changelog_opened', version);
            }}
          >
            Read the changelog
            <ExternalLink className='size-4' />
          </a>
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            trackWhatsNewEvent('whats_new_postponed', version);
            onClose?.();
          }}
        >
          Later
        </Button>
      </div>
    </div>
  );
}
