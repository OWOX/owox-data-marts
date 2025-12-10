import {
  FloatingPopoverHeader,
  FloatingPopoverTitle,
  FloatingPopoverContent,
} from '../../shared/components/FloatingPopover';

export function Video1GoogleSheetsReport() {
  return (
    <>
      <FloatingPopoverHeader>
        <FloatingPopoverTitle>
          SQL to Google Sheets in Minutes: Data Mart Setup
        </FloatingPopoverTitle>
      </FloatingPopoverHeader>
      <FloatingPopoverContent>
        <video
          src='https://github.com/user-attachments/assets/d2d9d913-a6fc-4949-a8e8-d697abd1631a'
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
