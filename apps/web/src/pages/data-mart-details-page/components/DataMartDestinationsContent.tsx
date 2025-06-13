import { useDataMartContext } from '../../../features/data-mart/model';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@owox/ui/components/card';

export default function DataMartDestinationsContent() {
  const { dataMart } = useDataMartContext();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Destinations</CardTitle>
        <CardDescription>{dataMart?.title}</CardDescription>
      </CardHeader>
      <CardContent>👋 Available on the Enterprise plan</CardContent>
    </Card>
  );
}
