import { useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';
import { useReleaseToAnnounce } from '../model/hooks/useReleaseToAnnounce';
import { changelogUrl, formatChapterTime, playerUrl } from '../model/links';
import { trackWhatsNewEvent } from '../model/whats-new.analytics';

export function WhatsNewPopoverTitle() {
  const { release } = useReleaseToAnnounce();
  return <>{release ? `What's new in OWOX Data Marts ${release.version}` : "What's new"}</>;
}

/** How many changes the card lists for a release without chapters. */
const LISTED_CHANGES = 5;

/**
 * The release video with its chapters: picking a chapter plays the video from that scene. A
 * release without a video, or without chapters, lists its changes instead. The changelog link
 * opens the release's full notes. The card keeps opening on every app load until its × is
 * clicked.
 */
export function WhatsNewPopoverContent() {
  const { release } = useReleaseToAnnounce();
  // Each pick reloads the player, also when the same chapter is picked again.
  const [playback, setPlayback] = useState<{ startTime: number | null; picks: number }>({
    startTime: null,
    picks: 0,
  });

  if (!release) return null;
  const { version, videoUrl, chapters, changes } = release;
  const listedChanges = chapters.length > 0 ? [] : changes.slice(0, LISTED_CHANGES);
  const moreChanges = changes.length - listedChanges.length;

  return (
    <div className='flex flex-col gap-3' data-testid='whatsNewPopover'>
      {videoUrl && (
        <iframe
          key={playback.picks}
          src={playerUrl(videoUrl, playback.startTime)}
          title={`What's new in OWOX Data Marts ${version}`}
          className='aspect-video w-full rounded-md border-none'
          allow='accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;'
          allowFullScreen
        />
      )}

      {listedChanges.length > 0 && (
        <ul className='flex flex-col gap-1.5 text-sm' aria-label='Changes'>
          {listedChanges.map((change, index) => (
            <li key={`${index}-${change}`} className='flex items-start gap-2'>
              <Check className='text-primary mt-0.5 size-4 shrink-0' aria-hidden='true' />
              <span>{change}</span>
            </li>
          ))}
          {moreChanges > 0 && (
            <li className='text-muted-foreground pl-6'>
              and {moreChanges} more {moreChanges === 1 ? 'change' : 'changes'}
            </li>
          )}
        </ul>
      )}

      {chapters.length > 0 && (
        <ul className='flex flex-col' aria-label='Chapters'>
          {chapters.map(chapter => {
            const isPlaying = playback.startTime === chapter.startTime;
            return (
              <li key={`${chapter.startTime}-${chapter.title}`}>
                <button
                  type='button'
                  aria-current={isPlaying ? 'true' : undefined}
                  className={cn(
                    'flex w-full cursor-pointer items-baseline gap-3 rounded-md px-2 py-1 text-left text-sm',
                    'hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                    isPlaying && 'bg-accent'
                  )}
                  onClick={() => {
                    setPlayback(current => ({
                      startTime: chapter.startTime,
                      picks: current.picks + 1,
                    }));
                    trackWhatsNewEvent('whats_new_chapter_played', version, {
                      chapter: chapter.title,
                    });
                  }}
                >
                  <span className='text-muted-foreground w-9 shrink-0 tabular-nums'>
                    {chapter.label ?? formatChapterTime(chapter.startTime)}
                  </span>
                  <span>{chapter.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div>
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
      </div>
    </div>
  );
}
