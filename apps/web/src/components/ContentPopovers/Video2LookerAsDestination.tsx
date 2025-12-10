import {
  FloatingPopoverHeader,
  FloatingPopoverTitle,
  FloatingPopoverContent,
} from '../../shared/components/FloatingPopover';

export function Video2LookerAsDestination() {
  return (
    <>
      <FloatingPopoverHeader>
        <FloatingPopoverTitle>
          Looker Studio Setup: Connect Your Data in Minutes
        </FloatingPopoverTitle>
      </FloatingPopoverHeader>
      <FloatingPopoverContent>
        <video
          src='https://github.com/user-attachments/assets/95e499eb-0a36-4180-846b-a829294e1afe'
          controls
          autoPlay
          muted
          loop
          playsInline
          className='w-full rounded-md'
        >
          Your browser does not support the video tag.
        </video>
      </FloatingPopoverContent>
    </>
  );
}
