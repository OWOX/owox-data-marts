import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { ComponentErrorBoundary } from '../../../../../components/errors';

/**
 * Wraps the node pane so an unrenderable node costs the author that pane and nothing else.
 *
 * The pane's editors read a node body that nothing has validated — Code mode is a
 * first-class authoring surface, and it is also the shape an MCP-authored manifest arrives
 * in — so any one of them can meet a field the declared types promise is there and is not.
 * Individual reads are guarded, but a boundary is what turns the next unguarded one from a
 * white screen into a message. It sits around the node editor only: the top bar, the nav
 * rail and the Builder/Code switch stay mounted, because Code mode is how the author fixes
 * the JSON that broke the form.
 */
export function NodeEditorBoundary({
  nodeName,
  children,
}: {
  nodeName: string;
  children: ReactNode;
}) {
  return (
    <ComponentErrorBoundary
      name={`connector-builder node "${nodeName}"`}
      // Selecting another node must clear the error, or one bad node would blank the pane
      // for every healthy one after it.
      resetKeys={[nodeName]}
      fallback={(error, retry) => (
        <div className='px-6 py-[18px]' data-testid='node-editor-error'>
          <div className='bg-card flex flex-col items-start gap-3 rounded-[10px] border p-[18px]'>
            <div className='flex items-center gap-2.5'>
              <AlertTriangle className='h-[18px] w-[18px] text-amber-500' strokeWidth={1.7} />
              <h3 className='text-foreground text-base font-medium'>
                This node can&apos;t be shown in the form
              </h3>
            </div>
            <p className='text-muted-foreground text-[13px] leading-relaxed'>
              Part of <span className='text-foreground font-mono'>{nodeName}</span> is a shape the
              builder form can&apos;t render. Nothing has been lost — switch to{' '}
              <b className='text-foreground font-medium'>Code</b> at the top of the left column to
              edit this node&apos;s JSON directly, then switch back.
            </p>
            <Button variant='outline' onClick={retry} className='h-[34px]'>
              Try again
            </Button>
            {import.meta.env.DEV && (
              <details className='w-full'>
                <summary className='text-muted-foreground cursor-pointer text-xs'>
                  Error details
                </summary>
                <pre className='text-muted-foreground mt-2 overflow-auto rounded border p-3 text-xs'>
                  {error.message}
                  {'\n\n'}
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    >
      {children}
    </ComponentErrorBoundary>
  );
}
