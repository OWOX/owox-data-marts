import { useEffect, useState } from 'react';
import {
  Sparkles,
  DatabaseZap,
  Network,
  SquareChartGantt,
  FolderTree,
  FilePenLine,
  Route,
  ScanText,
  Layers,
  Table,
  SwatchBook,
  ScanSearch,
  FlaskConical,
  Goal,
  CheckSquare,
  Group,
  Blocks,
  Grid2x2Check,
  ListChecks,
  FileScan,
} from 'lucide-react';

const STEPS = [
  { icon: Sparkles, text: 'Initializing intelligence...' },
  { icon: DatabaseZap, text: 'Connecting to data sources...' },
  { icon: Network, text: 'Mapping data relationships...' },
  { icon: FolderTree, text: 'Exploring dataset structure...' },
  { icon: ScanText, text: 'Scanning available fields...' },
  { icon: SquareChartGantt, text: 'Analyzing data patterns...' },
  { icon: Route, text: 'Selecting optimal insight path...' },
  { icon: Table, text: 'Preparing aggregated tables...' },
  { icon: Layers, text: 'Building visual model...' },
  { icon: FilePenLine, text: 'Finalizing insight output...' },
  { icon: SwatchBook, text: 'Validating field consistency...' },
  { icon: ScanSearch, text: 'Checking for missing values...' },
  { icon: FlaskConical, text: 'Detecting anomalies in data...' },
  { icon: ListChecks, text: 'Cross-referencing data sources...' },
  { icon: CheckSquare, text: 'Verifying aggregation results...' },
  { icon: Group, text: 'Ensuring data relationships are correct...' },
  { icon: Blocks, text: 'Refining visual model parameters...' },
  { icon: Grid2x2Check, text: 'Confirming data integrity...' },
  { icon: FileScan, text: 'Preparing final output for insights...' },
  { icon: Goal, text: 'Performing final quality checks...' },
];

export const InsightLoader = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => (prev + 1) % STEPS.length);
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const Icon = STEPS[step].icon;

  return (
    <div className='bg-muted h-full w-full rounded-tr-md rounded-br-md dark:bg-transparent'>
      <div className='flex h-full w-full animate-pulse flex-col items-center justify-center gap-4 p-4 text-center select-none'>
        <div
          key={`${String(step)}-icon`}
          className='text-muted-foreground animate-fade-slide-in-out'
        >
          <Icon className='h-8 w-8' strokeWidth={1} />
        </div>
        <h3
          key={`${String(step)}-text`}
          className='text-muted-foreground animate-fade-slide-in-out text-sm'
        >
          {STEPS[step].text}
        </h3>
      </div>
    </div>
  );
};
