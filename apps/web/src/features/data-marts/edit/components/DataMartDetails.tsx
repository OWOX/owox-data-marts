import { useState } from 'react';
import { useDataMart } from '../model';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { MoreVertical, Trash2, ArrowLeft } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { cn } from '@owox/ui/lib/utils';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';
import { Toaster } from '../../../../shared/components/Toaster';

interface DataMartDetailsProps {
  id: string;
}

export function DataMartDetails({ id }: DataMartDetailsProps) {
  const {
    dataMart,
    deleteDataMart,
    updateDataMartTitle,
    updateDataMartDescription,
    isLoading,
    error,
  } = useDataMart(id);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const navigate = useNavigate();

  const navigation = [
    { name: 'Overview', path: 'overview' },
    { name: 'Data Setup', path: 'data-setup' },
    { name: 'Destinations', path: 'destinations' },
  ];

  const handleTitleUpdate = async (newTitle: string) => {
    if (!dataMart) return;
    await updateDataMartTitle(dataMart.id, newTitle);
  };

  if (isLoading) {
    // Loading data mart details...
  }

  if (error) {
    return <div className='rounded bg-red-100 p-4 text-red-700'>Error: {error}</div>;
  }

  if (!dataMart) {
    return <div className='p-4'>No data mart found</div>;
  }

  return (
    <div className={'px-12 py-8'}>
      <Toaster />
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className='rounded p-1 hover:bg-gray-100'>
              <MoreVertical className='h-5 w-5' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
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
                      ? 'border-brand-blue-500 text-brand-blue-500'
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
        <Outlet context={{ dataMart, updateDataMartDescription }} />
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
