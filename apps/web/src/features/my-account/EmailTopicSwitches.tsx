import {
  SwitchItemCard,
  SwitchItemCardContent,
  SwitchItemCardDescription,
  SwitchItemCardTitle,
  SwitchItemCardToggle,
} from '@owox/ui/components/common/switch-item-card';
import { Label } from '@owox/ui/components/label';
import type { AccountEmailTopic } from './account-profile.service';

const topicText: Record<string, { label: string; description: string } | undefined> = {
  ServiceNotifications: {
    label: 'Service notifications',
    description: 'Updates about OWOX services.',
  },
  PerformanceSuggestions: {
    label: 'Tips and suggestions',
    description: 'Advice on using OWOX and improving your workflows.',
  },
  Offers: {
    label: 'Offers',
    description: 'Promotions and special offers from OWOX.',
  },
};

export function EmailTopicSwitches({
  topics,
  viewOnly = false,
  saving = false,
  savingId,
  onChange,
}: {
  topics: AccountEmailTopic[];
  viewOnly?: boolean;
  saving?: boolean;
  savingId?: string;
  onChange: (topic: AccountEmailTopic) => void;
}) {
  if (!topics.length) {
    return <p className='text-muted-foreground text-sm'>No email topics are available.</p>;
  }

  return (
    <div className='flex flex-col gap-3' aria-busy={saving}>
      {topics.map(({ id, subscribed }) => {
        const copy = Object.prototype.hasOwnProperty.call(topicText, id)
          ? topicText[id]
          : undefined;
        const controlId = `email-topic-${id}`;
        return (
          <SwitchItemCard key={id}>
            <SwitchItemCardToggle
              id={controlId}
              aria-describedby={copy ? `${controlId}-description` : undefined}
              checked={subscribed}
              disabled={viewOnly || saving}
              loading={saving && savingId === id}
              tooltipTextSwitchOn='Turn off emails for this topic'
              tooltipTextSwitchOff='Turn on emails for this topic'
              tooltipTextSwitchDisabled={viewOnly ? 'Read-only mode' : 'Saving email preferences'}
              onCheckedChange={checked => {
                if (!viewOnly && !saving) onChange({ id, subscribed: checked });
              }}
            />
            <SwitchItemCardContent className='min-w-0 pr-4'>
              <SwitchItemCardTitle>
                <Label htmlFor={controlId}>
                  {copy?.label ?? id.replace(/([a-z])([A-Z])/g, '$1 $2')}
                </Label>
              </SwitchItemCardTitle>
              {copy && (
                <SwitchItemCardDescription id={`${controlId}-description`}>
                  {copy.description}
                </SwitchItemCardDescription>
              )}
            </SwitchItemCardContent>
          </SwitchItemCard>
        );
      })}
    </div>
  );
}
