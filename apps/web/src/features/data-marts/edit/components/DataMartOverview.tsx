import { Textarea } from '@owox/ui/components/textarea';

export function DataMartOverview() {
  const description =
    'This Data Mart collects all our precious visitors — whether they clicked an expensive ad or just got lost and ended up here.\n\n' +
    '✅ Great for analyzing campaigns, tracking paid channel ROI, and figuring out why "organic" means "someone typed the exact URL."\n\n' +
    '💸 Warning: May cause mild emotional distress when you see how much we spent on that one click from Australia.\n\n' +
    '📊 Comes with built-in excuses for when traffic drops — just blame seasonality!';

  return (
    <div>
      <Textarea defaultValue={description} style={{ whiteSpace: 'pre-wrap' }}></Textarea>
    </div>
  );
}
