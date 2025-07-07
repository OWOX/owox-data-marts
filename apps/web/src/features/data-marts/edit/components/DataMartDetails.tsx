import { useState } from 'react';
import { useDataMart } from '../model';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { MoreVertical, Trash2, ArrowLeft, Upload, Play } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { cn } from '@owox/ui/lib/utils';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';
import { StatusLabel, StatusTypeEnum } from '../../../../shared/components/StatusLabel';
import { Button } from '../../../../shared/components/Button';
import { DataMartDefinitionType, DataMartStatus, getValidationErrorMessages } from '../../shared';
import { toast } from 'react-hot-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { CardSkeleton } from '../../../../shared/components/CardSkeleton';

interface DataMartDetailsProps {
  id: string;
}

export function DataMartDetails({ id }: DataMartDetailsProps) {
  const navigate = useNavigate();

  const {
    dataMart,
    deleteDataMart,
    updateDataMartTitle,
    updateDataMartDescription,
    updateDataMartDefinition,
    publishDataMart,
    runDataMart,
    isLoading,
    error,
    getErrorMessage,
  } = useDataMart(id);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const navigation = [
    { name: 'Overview', path: 'overview' },
    { name: 'Data Setup', path: 'data-setup' },
    { name: 'Destinations', path: 'reports' },
  ];

  const handleTitleUpdate = async (newTitle: string) => {
    if (!dataMart) return;
    await updateDataMartTitle(dataMart.id, newTitle);
  };

  const handlePublish = async () => {
    if (!dataMart) return;
    setIsPublishing(true);

    try {
      await publishDataMart(dataMart.id);
      toast.success('Data mart published successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to publish data mart');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleManualRun = async () => {
    if (!dataMart) return;
    await runDataMart(dataMart.id);
  };

  if (isLoading) {
    return (
      <div className='dm-page-header'>
        <CardSkeleton />
      </div>
    );
  }

  if (!dataMart) {
    return <div className='dm-page-header'>No data mart found</div>;
  }

  return (
    <div className={'px-12 py-6'}>
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center'>
          <button
            onClick={() => void navigate('/data-marts')}
            className='rounded p-1 hover:bg-gray-100'
            title='Back to Data Marts'
          >
            <ArrowLeft className='h-5 w-5 text-gray-400' />
          </button>
          <InlineEditTitle
            title={dataMart.title}
            onUpdate={handleTitleUpdate}
            className='text-xl font-medium'
          />
        </div>
        <div
          className={'flex items-center gap-2' + (isPublishing ? ' opacity-50' : '')}
          style={{ minWidth: '120px' }}
        >
          <div className='ml-4 flex items-center gap-2'>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <StatusLabel
                    type={
                      dataMart.status.code === DataMartStatus.PUBLISHED
                        ? StatusTypeEnum.SUCCESS
                        : StatusTypeEnum.NEUTRAL
                    }
                    variant='subtle'
                  >
                    {dataMart.status.displayName}
                  </StatusLabel>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {dataMart.status.code === DataMartStatus.PUBLISHED
                  ? 'Published data mart is available for scheduled runs'
                  : 'Draft data mart is not available for scheduled runs. Publish to make it available'}
              </TooltipContent>
            </Tooltip>
            {dataMart.status.code === DataMartStatus.DRAFT && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        void handlePublish();
                      }}
                      disabled={isPublishing || !dataMart.canPublish}
                      className='ml-2 flex items-center gap-1'
                    >
                      <Upload className='h-4 w-4' />
                      Publish
                    </Button>
                  </div>
                </TooltipTrigger>
                {!dataMart.canPublish && (
                  <TooltipContent>
                    <div>Data mart cannot be published. Please fix the validation issues:</div>
                    {dataMart.validationErrors.length > 0 && (
                      <ul className='mt-2 list-disc pl-5'>
                        {getValidationErrorMessages(dataMart.validationErrors).map(
                          (message, index) => (
                            <li key={index}>{message}</li>
                          )
                        )}
                      </ul>
                    )}
                  </TooltipContent>
                )}
              </Tooltip>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className='rounded p-1 hover:bg-gray-100'>
                <MoreVertical className='h-5 w-5' />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {dataMart.status.code === DataMartStatus.PUBLISHED &&
                dataMart.definitionType === DataMartDefinitionType.CONNECTOR && (
                  <DropdownMenuItem
                    className='text-blue-600'
                    onClick={() => {
                      void handleManualRun();
                    }}
                  >
                    <Play className='mr-2 h-4 w-4' />
                    Manual Run
                  </DropdownMenuItem>
                )}
              <DropdownMenuItem
                className='text-red-600'
                onClick={() => {
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div>
        <nav className='-mb-px flex space-x-4 border-b' aria-label='Tabs' role='tablist'>
          {navigation.map(item => {
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  )
                }
              >
                {item.name}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className='pt-4'>
        <Outlet
          context={{
            dataMart,
            isLoading,
            error,
            getErrorMessage,
            updateDataMartDescription,
            updateDataMartDefinition,
          }}
        />
      </div>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete Data Mart'
        description={
          <>
            Are you sure you want to delete <strong>"{dataMart.title}"</strong>? This action cannot
            be undone.
          </>
        }
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void (async () => {
            try {
              await deleteDataMart(dataMart.id);
              setIsDeleteDialogOpen(false);
              void navigate('/data-marts');
            } catch (error) {
              console.error('Failed to delete data mart:', error);
            }
          })();
        }}
      />
    </div>
  );
}
