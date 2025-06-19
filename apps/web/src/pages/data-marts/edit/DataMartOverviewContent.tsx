import { DataMartOverview } from '../../../features/data-marts/edit';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@owox/ui/components/card';

export default function DataMartOverviewContent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Description</CardTitle>
        <CardDescription></CardDescription>
      </CardHeader>
      <CardContent>
        <DataMartOverview />
      </CardContent>
    </Card>
  );
}
