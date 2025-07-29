import { useState, type FC } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  type DataDestination,
  DataDestinationType,
  generateLookerStudioJsonConfig,
} from '../../../shared';
import toast from 'react-hot-toast';
import { isLookerStudioCredentials } from '../../../shared/model/types/looker-studio-credentials.ts';

/**
 * Component for displaying a context menu of actions on the Destination in a table.
 *
 * @param id - destination identifier
 * @param type - destination type
 * @param credentials - destination credentials
 * @param onViewDetails - view details handler
 * @param onEdit - edit handler
 * @param onDelete - delete handler
 * @param onRotateSecretKey - rotate secret key handler
 */
interface DataDestinationActionsCellProps {
  id: string;
  type: DataDestinationType;
  credentials?: DataDestination['credentials'];
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
  onRotateSecretKey?: (id: string) => void;
}

export const DataDestinationActionsCell: FC<DataDestinationActionsCellProps> = ({
  id,
  type,
  credentials,
  onEdit,
  onDelete,
  onRotateSecretKey,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleCopyJsonConfig = () => {
    if (credentials && isLookerStudioCredentials(credentials)) {
      const jsonConfig = generateLookerStudioJsonConfig(credentials);
      void navigator.clipboard.writeText(jsonConfig);
      toast.success('JSON Config copied to clipboard');
    }
  };

  const isLookerStudio = type === DataDestinationType.LOOKER_STUDIO;
  const hasSecretKey =
    credentials && 'destinationSecretKey' in credentials && credentials.destinationSecretKey;

  return (
    <>
      <div className='text-right'>
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity ${isMenuOpen ? 'opacity-100' : 'group-hover:opacity-100'}`}
              aria-label='Open menu'
            >
              <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              onClick={() => void onEdit?.(id)}
              className='dm-card-table-body-row-actiondropdownitem'
            >
              Edit
            </DropdownMenuItem>

            {isLookerStudio && hasSecretKey && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleCopyJsonConfig}
                  className='dm-card-table-body-row-actiondropdownitem'
                >
                  Copy JSON Config
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    onRotateSecretKey?.(id);
                  }}
                  className='dm-card-table-body-row-actiondropdownitem'
                >
                  Rotate Secret Key
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete?.(id)}
              className='dm-card-table-body-row-actiondropdownitem text-red-600'
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};
