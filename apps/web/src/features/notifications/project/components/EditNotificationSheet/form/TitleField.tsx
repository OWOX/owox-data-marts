import { Input } from '@owox/ui/components/input';
import { FieldItem, FieldLabel } from './FormField';

interface TitleFieldProps {
  title: string;
}

export function TitleField({ title }: TitleFieldProps) {
  return (
    <FieldItem>
      <FieldLabel tooltip='The name of this notification type'>Report title</FieldLabel>
      <Input value={title} disabled />
    </FieldItem>
  );
}
