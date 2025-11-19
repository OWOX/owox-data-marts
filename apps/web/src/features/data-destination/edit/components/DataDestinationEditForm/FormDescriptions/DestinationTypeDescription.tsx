import { Accordion } from '@owox/ui/components/accordion';
import type { ComponentType } from 'react';
import { DataDestinationType } from '../../../../shared';

import {
  GoogleSheetsDescription,
  LookerStudioDescription,
  ODataDescription,
  EmailDescription,
  SlackDescription,
  MicrosoftTeamsDescription,
  GoogleChatDescription,
} from './descriptions';

const destinationDescriptions: Record<DataDestinationType, ComponentType> = {
  [DataDestinationType.GOOGLE_SHEETS]: GoogleSheetsDescription,
  [DataDestinationType.LOOKER_STUDIO]: LookerStudioDescription,
  [DataDestinationType.ODATA]: ODataDescription,
  [DataDestinationType.EMAIL]: EmailDescription,
  [DataDestinationType.SLACK]: SlackDescription,
  [DataDestinationType.MS_TEAMS]: MicrosoftTeamsDescription,
  [DataDestinationType.GOOGLE_CHAT]: GoogleChatDescription,
};

interface DestinationTypeDescriptionProps {
  destinationType: DataDestinationType;
}

export default function DestinationTypeDescription({
  destinationType,
}: DestinationTypeDescriptionProps) {
  const DescriptionComponent = destinationDescriptions[destinationType];

  return (
    <Accordion variant='common' type='single' collapsible>
      <DescriptionComponent />
    </Accordion>
  );
}
