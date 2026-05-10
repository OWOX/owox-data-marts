import { Input } from '@owox/ui/components/input';
import { FieldItem, FieldLabel } from './FormField';

interface TitleFieldProps {
  title: string;
}

export function TitleField({ title }: TitleFieldProps) {
  return (
    <FieldItem>
      <FieldLabel tooltip='The name of this notification. Disabled for service predefined notifications'>
        Notification title
      </FieldLabel>
      <Input value={title} disabled />
    </FieldItem>
  );
}
