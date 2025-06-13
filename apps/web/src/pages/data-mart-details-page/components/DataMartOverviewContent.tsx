import { DataMartOverview } from '../../../features/data-mart';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@owox/ui/components/card';
import { Button } from '@owox/ui/components/button';

export default function DataMartOverviewContent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Description</CardTitle>
        <CardDescription>What This Data Mart Shows</CardDescription>
        <CardAction>{/*<Button variant='ghost'>Edit</Button>*/}</CardAction>
      </CardHeader>
      <CardContent>
        <DataMartOverview />
      </CardContent>
      <CardFooter className='flex justify-start'>
        <Button variant='secondary'>Save</Button>
        <Button className='mr-2' variant='ghost'>
          Discard
        </Button>
      </CardFooter>
    </Card>
  );
}
