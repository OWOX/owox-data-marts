import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from '@owox/ui/components/card';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { DataMartCodeEditor } from '../../../features/data-mart';
import { Button } from '@owox/ui/components/button';
import { ChevronRight } from 'lucide-react';
import { GoogleBigQueryIcon } from '../../../shared';

export default function DataMartDataSetupContent() {
  const [isDataStorageCollapsed, setIsDataStorageCollapsed] = useState(false);
  const [isInputSourceCollapsed, setIsInputSourceCollapsed] = useState(false);

  return (
    <div className={'flex flex-col gap-4'}>
      <Card>
        <CardHeader>
          <CardTitle>Data Storage</CardTitle>
          <CardDescription>Configure where your data will be stored</CardDescription>
          <CardAction>
            <button
              onClick={() => {
                setIsDataStorageCollapsed(!isDataStorageCollapsed);
              }}
              className='flex h-6 w-6 items-center justify-center rounded-full hover:bg-slate-100'
              aria-label={isDataStorageCollapsed ? 'Expand' : 'Collapse'}
            >
              {isDataStorageCollapsed ? (
                <ChevronDown className='h-4 w-4 text-gray-500' />
              ) : (
                <ChevronUp className='h-4 w-4 text-gray-500' />
              )}
            </button>
          </CardAction>
        </CardHeader>
        {!isDataStorageCollapsed && (
          <CardContent>
            <div className='flex cursor-pointer items-center justify-between rounded-md p-3 hover:bg-slate-50'>
              <div className='flex items-center gap-3'>
                <div className='flex h-10 w-10 items-center justify-center'>
                  <GoogleBigQueryIcon size={24} />
                </div>
                <div>
                  <p className='font-medium'>Google BigQuery</p>
                  <p className='text-sm text-gray-500'>my-project-dubovyi</p>
                </div>
              </div>
              <ChevronRight className='h-5 w-5 text-gray-400' />
            </div>
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Input source</CardTitle>
          <CardDescription>SQL Query</CardDescription>
          <CardAction>
            <button
              onClick={() => {
                setIsInputSourceCollapsed(!isInputSourceCollapsed);
              }}
              className='flex h-6 w-6 items-center justify-center rounded-full hover:bg-slate-100'
              aria-label={isInputSourceCollapsed ? 'Expand' : 'Collapse'}
            >
              {isInputSourceCollapsed ? (
                <ChevronDown className='h-4 w-4 text-gray-500' />
              ) : (
                <ChevronUp className='h-4 w-4 text-gray-500' />
              )}
            </button>
          </CardAction>
        </CardHeader>
        {!isInputSourceCollapsed && (
          <CardContent>
            <DataMartCodeEditor></DataMartCodeEditor>
          </CardContent>
        )}
        {!isInputSourceCollapsed && (
          <CardFooter>
            <Button variant='secondary' className='mr-4'>
              Save
            </Button>
            <Button variant='ghost'>Discard</Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
