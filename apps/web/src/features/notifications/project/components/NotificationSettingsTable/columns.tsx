import type { ColumnDef } from '@tanstack/react-table';
import { Switch } from '@owox/ui/components/switch';
import { ReceiversAvatarGroup } from './ReceiversAvatarGroup';
import { GROUPING_DELAY_OPTIONS } from '../../types';
import type { NotificationSettingsItem } from '../../types';
import { SortableHeader } from '../../../../../shared/components/Table/SortableHeader';
import { ToggleColumnsHeader } from '../../../../../shared/components/Table/ToggleColumnsHeader';
import { NotificationSettingsActionsCell } from './NotificationSettingsActionsCell';

export enum NotificationSettingsColumnKey {
  TITLE = 'title',
  RECEIVERS = 'receivers',
  WEBHOOK_URL = 'webhookUrl',
  GROUPING_DELAY = 'groupingDelayCron',
  ENABLED = 'enabled',
}

export const notificationSettingsColumnLabels: Record<NotificationSettingsColumnKey, string> = {
  [NotificationSettingsColumnKey.TITLE]: 'Title',
  [NotificationSettingsColumnKey.RECEIVERS]: 'Recipients',
  [NotificationSettingsColumnKey.WEBHOOK_URL]: 'Webhook URL',
  [NotificationSettingsColumnKey.GROUPING_DELAY]: 'Grouping Delay',
  [NotificationSettingsColumnKey.ENABLED]: 'Status',
};

function getGroupingDelayLabel(cronExpression: string): string {
  const option = GROUPING_DELAY_OPTIONS.find(
    opt => opt.value === (cronExpression as typeof opt.value)
  );
  return option?.label ?? cronExpression;
}

interface GetNotificationSettingsColumnsOptions {
  onToggleEnabled: (setting: NotificationSettingsItem, enabled: boolean) => void | Promise<void>;
  onEdit: (setting: NotificationSettingsItem) => void;
}

export function getNotificationSettingsColumns({
  onToggleEnabled,
  onEdit,
}: GetNotificationSettingsColumnsOptions): ColumnDef<NotificationSettingsItem>[] {
  return [
    {
      id: NotificationSettingsColumnKey.TITLE,
      accessorKey: 'title',
      size: 300,
      minSize: 150,
      meta: {
        title: notificationSettingsColumnLabels[NotificationSettingsColumnKey.TITLE],
      },
      header: ({ column }) => (
        <SortableHeader column={column}>
          {notificationSettingsColumnLabels[NotificationSettingsColumnKey.TITLE]}
        </SortableHeader>
      ),
      cell: ({ row }) => <span className='font-medium'>{row.original.title}</span>,
    },
    {
      id: NotificationSettingsColumnKey.RECEIVERS,
      accessorKey: 'receivers',
      size: 160,
      meta: {
        title: notificationSettingsColumnLabels[NotificationSettingsColumnKey.RECEIVERS],
      },
      header: ({ column }) => (
        <SortableHeader column={column}>
          {notificationSettingsColumnLabels[NotificationSettingsColumnKey.RECEIVERS]}
        </SortableHeader>
      ),
      cell: ({ row }) => <ReceiversAvatarGroup receivers={row.original.receivers} />,
    },
    {
      id: NotificationSettingsColumnKey.WEBHOOK_URL,
      accessorKey: 'webhookUrl',
      size: 220,
      meta: {
        title: notificationSettingsColumnLabels[NotificationSettingsColumnKey.WEBHOOK_URL],
      },
      header: ({ column }) => (
        <SortableHeader column={column}>
          {notificationSettingsColumnLabels[NotificationSettingsColumnKey.WEBHOOK_URL]}
        </SortableHeader>
      ),
      cell: ({ row }) =>
        row.original.webhookUrl ? (
          <span className='text-muted-foreground block min-w-0 truncate overflow-hidden text-sm whitespace-nowrap'>
            {row.original.webhookUrl}
          </span>
        ) : (
          <span className='text-muted-foreground text-sm'>—</span>
        ),
    },
    {
      id: NotificationSettingsColumnKey.GROUPING_DELAY,
      accessorKey: 'groupingDelayCron',
      size: 140,
      meta: {
        title: notificationSettingsColumnLabels[NotificationSettingsColumnKey.GROUPING_DELAY],
      },
      header: ({ column }) => (
        <SortableHeader column={column}>
          {notificationSettingsColumnLabels[NotificationSettingsColumnKey.GROUPING_DELAY]}
        </SortableHeader>
      ),
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm'>
          {getGroupingDelayLabel(row.original.groupingDelayCron)}
        </span>
      ),
    },
    {
      id: NotificationSettingsColumnKey.ENABLED,
      accessorKey: 'enabled',
      size: 80,
      meta: {
        title: notificationSettingsColumnLabels[NotificationSettingsColumnKey.ENABLED],
      },
      header: ({ column }) => (
        <SortableHeader column={column}>
          {notificationSettingsColumnLabels[NotificationSettingsColumnKey.ENABLED]}
        </SortableHeader>
      ),
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
    {
      id: 'actions',
      size: 80,
      enableResizing: false,
      header: ({ table }) => <ToggleColumnsHeader table={table} />,
      cell: ({ row }) => <NotificationSettingsActionsCell setting={row.original} onEdit={onEdit} />,
    },
  ];
}
