import { AppWizardStepHero } from '@owox/ui/components/common/wizard';
import { RawBase64Icon } from '../../../../../../shared/icons';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import { CustomConnectorIcon } from '../../../../shared/components/CustomConnectorIcon';

interface StepperHeroBlockProps {
  connector: ConnectorListItem;
  size?: number;
  variant?: 'compact' | 'default';
}

export function StepperHeroBlock({
  connector,
  size = 24,
  variant = 'compact',
}: StepperHeroBlockProps) {
  return (
    <AppWizardStepHero
      icon={
        connector.isCustom && !connector.logoBase64 ? (
          <CustomConnectorIcon size={size} />
        ) : (
          <RawBase64Icon base64={connector.logoBase64} size={size} />
        )
      }
      title={connector.displayName}
      docUrl={connector.docUrl}
      variant={variant}
    />
  );
}
