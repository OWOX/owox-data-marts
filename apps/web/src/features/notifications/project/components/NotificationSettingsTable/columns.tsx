import type { ColumnDef } from '@tanstack/react-table';
import { Switch } from '@owox/ui/components/switch';
import { ReceiversAvatarGroup } from './ReceiversAvatarGroup';
import { GROUPING_DELAY_OPTIONS } from '../../types';
import type { NotificationSettingsItem } from '../../types';

export enum NotificationSettingsColumnKey {
  TITLE = 'title',
  RECEIVERS = 'receivers',
  WEBHOOK_URL = 'webhookUrl',
  GROUPING_DELAY = 'groupingDelayCron',
  ENABLED = 'enabled',
}

function getGroupingDelayLabel(cronExpression: string): string {
  const option = GROUPING_DELAY_OPTIONS.find(
    opt => opt.value === (cronExpression as typeof opt.value)
  );
  return option?.label ?? cronExpression;
}

interface GetNotificationSettingsColumnsOptions {
  onToggleEnabled: (setting: NotificationSettingsItem, enabled: boolean) => void | Promise<void>;
}

export function getNotificationSettingsColumns({
  onToggleEnabled,
}: GetNotificationSettingsColumnsOptions): ColumnDef<NotificationSettingsItem>[] {
  return [
    {
      id: NotificationSettingsColumnKey.TITLE,
      accessorKey: 'title',
      header: 'Title',
      size: 300,
      minSize: 150,
      cell: ({ row }) => <span className='font-medium'>{row.original.title}</span>,
    },
    {
      id: NotificationSettingsColumnKey.RECEIVERS,
      accessorKey: 'receivers',
      header: 'Recipients',
      size: 160,
      enableSorting: false,
      cell: ({ row }) => <ReceiversAvatarGroup receivers={row.original.receivers} />,
    },
    {
      id: NotificationSettingsColumnKey.WEBHOOK_URL,
      accessorKey: 'webhookUrl',
      header: 'Webhook URL',
      size: 220,
      enableSorting: false,
      cell: ({ row }) =>
        row.original.webhookUrl ? (
          <span className='text-muted-foreground max-w-[200px] truncate text-sm'>
            {row.original.webhookUrl}
          </span>
        ) : (
          <span className='text-muted-foreground text-sm'>—</span>
        ),
    },
    {
      id: NotificationSettingsColumnKey.GROUPING_DELAY,
      accessorKey: 'groupingDelayCron',
      header: 'Grouping delay',
      size: 140,
      enableSorting: false,
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm'>
          {getGroupingDelayLabel(row.original.groupingDelayCron)}
        </span>
      ),
    },
    {
      id: NotificationSettingsColumnKey.ENABLED,
      accessorKey: 'enabled',
      header: 'Status',
      size: 80,
      enableSorting: false,
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
          onCheckedChange={checked => {
            void onToggleEnabled(row.original, checked);
          }}
          onClick={e => {
            e.stopPropagation();
          }}
          aria-label={`Toggle ${row.original.title}`}
        />
      ),
    },
  ];
}
