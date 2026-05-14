import { useOutletContext } from 'react-router-dom';
import { InlineEditDescription } from '../../../../shared/components/InlineEditDescription';
import { DataMartDefinitionType, DataMartMetadataScope } from '../../shared';
import { useAiHelper, useAiHelperAvailability } from '../model/hooks';
import { AiHelperButton } from './AiHelperButton';

interface DataMartContextType {
  dataMart: {
    description: string;
    id: string;
    definitionType: DataMartDefinitionType | null;
  };
  updateDataMartDescription: (id: string, description: string | null) => Promise<void>;
}

export function DataMartOverview() {
  const { dataMart, updateDataMartDescription } = useOutletContext<DataMartContextType>();
  const handleDescriptionUpdate = async (newDescription: string | null) => {
    await updateDataMartDescription(dataMart.id, newDescription);
  };

  const { enabled: isAiHelperEnabled } = useAiHelperAvailability();
  const { generateDescription, pendingScope } = useAiHelper();

  const isGenerating = pendingScope?.scope === DataMartMetadataScope.DESCRIPTION;
  const isConnector = dataMart.definitionType === DataMartDefinitionType.CONNECTOR;
  const showAiHelper = isAiHelperEnabled && !isConnector;

  return (
    <div>
      <InlineEditDescription
        description={dataMart.description}
        onUpdate={handleDescriptionUpdate}
        placeholder='Add a description for this Data Mart...'
        aiButton={
          showAiHelper
            ? ({ setValue }) => (
                <AiHelperButton
                  onClick={() => {
                    void (async () => {
                      const suggested = await generateDescription(dataMart.id);
                      if (suggested) setValue(suggested);
                    })();
                  }}
                  isLoading={isGenerating}
                  disabled={pendingScope !== null}
                  tooltip='Generate description with AI'
                />
              )
            : undefined
        }
      />
    </div>
  );
}
