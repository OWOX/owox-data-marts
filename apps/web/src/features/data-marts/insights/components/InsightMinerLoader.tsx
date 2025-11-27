import { useEffect, useState, useMemo } from 'react';
import { Brain, Database, Network } from 'lucide-react';

const ACTIVE_TITLES = [
  'Connecting to data sources...',
  'Analyzing structure...',
  'Detecting patterns...',
  'Generating insights...',
  'Refining output...',
];

const STATIC_MESSAGES = [
  'Interrogating the data until it confesses the truth. Please stand by.',
  "Looking for a needle in a stack of needles. We're almost there.",
  'The algorithms are having an intense debate. Give them a moment to agree.',
  'Sifting through digital sand to find gold. Great insights take a little time.',
  'Untangling the quantum knots in your dataset. Thanks for your patience.',
  'Converting raw chaos into structured wisdom. Work in progress...',
  'Running the numbers twice, just to be sure. Hang tight.',
  "Explaining the context to the AI. It's learning fast, please wait.",
  'Compiling the magic. This might take a few seconds (or a sip of coffee).',
  'Checking every single data point. We believe in quality over speed.',
];

export const InsightLoader = () => {
  const [titleIndex, setTitleIndex] = useState(0);
  const randomMessage = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * STATIC_MESSAGES.length);
    return STATIC_MESSAGES[randomIndex];
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTitleIndex(prev => (prev + 1) % ACTIVE_TITLES.length);
    }, 5000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div className='flex h-full w-full flex-col items-center justify-center p-8 text-center backdrop-blur-sm'>
      <div className='relative mb-8 flex h-24 w-24 items-center justify-center'>
        <div className='absolute inset-0 animate-[spin_12s_linear_infinite] rounded-full border-2 border-dashed border-slate-200 dark:border-slate-700' />
        <div className='absolute inset-3 animate-[spin_8s_linear_infinite_reverse] rounded-full border-2 border-dotted border-slate-300 dark:border-slate-600' />
        <div className='relative z-10 animate-pulse text-slate-400 dark:text-slate-500'>
          <Brain className='h-8 w-8' strokeWidth={1.5} />
        </div>
        <div className='absolute top-0 -left-4 animate-bounce text-slate-200 delay-75 duration-[3000ms] dark:text-slate-800'>
          <Database className='h-4 w-4' />
        </div>
        <div className='absolute -right-4 bottom-0 animate-bounce text-slate-200 delay-150 duration-[2500ms] dark:text-slate-800'>
          <Network className='h-4 w-4' />
        </div>
      </div>

      <div className='flex flex-col items-center gap-3 px-4'>
        <h3
          key={ACTIVE_TITLES[titleIndex]}
          className='animate-in fade-in slide-in-from-bottom-2 text-lg font-medium text-slate-700 duration-500'
        >
          {ACTIVE_TITLES[titleIndex]}
        </h3>

        <p className='max-w-[320px] text-sm leading-relaxed text-slate-400'>{randomMessage}</p>
      </div>
    </div>
  );
};
