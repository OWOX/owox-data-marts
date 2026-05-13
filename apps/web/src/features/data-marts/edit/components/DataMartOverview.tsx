import { useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { InlineEditDescription } from '../../../../shared/components/InlineEditDescription';
import { DataMartMetadataScope } from '../../shared';
import { useAiHelper, useAiHelperAvailability } from '../model/hooks';
import { AiHelperButton } from './AiHelperButton';

interface DataMartContextType {
  dataMart: {
    description: string;
    id: string;
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

  const handleGenerateDescription = useCallback(() => {
    if (!dataMart.id) return;
    void (async () => {
      const suggested = await generateDescription(dataMart.id);
      if (suggested) {
        await updateDataMartDescription(dataMart.id, suggested);
      }
    })();
  }, [dataMart.id, generateDescription, updateDataMartDescription]);

  const isGenerating = pendingScope?.scope === DataMartMetadataScope.DESCRIPTION;

  return (
    <div>
      <InlineEditDescription
        description={dataMart.description}
        onUpdate={handleDescriptionUpdate}
        placeholder='Add a description for this Data Mart...'
        aiButton={
          isAiHelperEnabled ? (
            <AiHelperButton
              onClick={handleGenerateDescription}
              isLoading={isGenerating}
              disabled={pendingScope !== null}
              tooltip='Generate description with AI'
            />
          ) : undefined
        }
      />
    </div>
  );
}
