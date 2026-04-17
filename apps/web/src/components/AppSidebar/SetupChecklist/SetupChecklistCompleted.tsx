export function SetupChecklistCompleted() {
  return (
    <div className='flex flex-col items-center gap-2 px-4 pt-4 pb-8 text-center'>
      {/* Icon */}
      <div className='animate-in fade-in zoom-in-95 duration-500'>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          width='32'
          height='32'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          strokeLinecap='round'
          strokeLinejoin='round'
          className='text-primary'
          aria-hidden='true'
        >
          {/* Confetti dots */}
          <path d='M4 3h.01' className='animate-confetti-loop' />
          <path d='M22 8h.01' className='animate-confetti-loop [animation-delay:150ms]' />
          <path d='M15 2h.01' className='animate-confetti-loop [animation-delay:300ms]' />
          <path d='M22 20h.01' className='animate-confetti-loop [animation-delay:450ms]' />

          {/* Lines */}
          <path
            d='m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10'
            className='animate-confetti-loop delay-200'
          />

          <path
            d='m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17'
            className='animate-confetti-loop delay-300'
          />

          <path
            d='m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7'
            className='animate-confetti-loop delay-400'
          />

          {/* Cone + Burst */}
          <g className='animate-party-cone'>
            <path d='M5.8 11.3 2 22l10.7-3.79' />
            <path d='M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z' />
          </g>
        </svg>
      </div>

      <div className='flex flex-col items-center gap-1'>
        <p className='text-primary text-sm font-semibold'>You did an amazing job!</p>
        <p className='text-primary/75 dark:text-primary/50 text-xs'>
          Your data is ready. Keep exploring.
        </p>
      </div>
    </div>
  );
}
