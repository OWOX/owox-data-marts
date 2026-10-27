// Imported by migration 1792700000000: keep it when the legacy code goes.
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';

const { GOOGLE_SHEETS, GOOGLE_CHAT } = DataDestinationType;
const { GOOGLE_SERVICE_ACCOUNT, GOOGLE_OAUTH, GOOGLE_CHAT_WEBHOOK } = DestinationCredentialType;

/** Live Sheets and webhook Chat Destinations on a live old key row with no binding row in any project or state. */
export const UNCONVERTED_DESTINATIONS_SQL = `
SELECT destination.id AS id, destination.projectId AS projectId
FROM data_destination destination
INNER JOIN data_destination_credentials oldKey
  ON oldKey.id = destination.credentialId AND oldKey.deletedAt IS NULL
WHERE destination.deletedAt IS NULL
  AND (
    (destination.type = '${GOOGLE_SHEETS}'
      AND oldKey.type IN ('${GOOGLE_SERVICE_ACCOUNT}', '${GOOGLE_OAUTH}'))
    OR (destination.type = '${GOOGLE_CHAT}' AND oldKey.type = '${GOOGLE_CHAT_WEBHOOK}')
  )
  AND NOT EXISTS (
    SELECT 1 FROM credential_consumer_binding binding
    WHERE binding.consumerType = 'destination' AND binding.consumerId = destination.id
      AND binding.requirementKey = 'destination'
  )`;
