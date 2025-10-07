import { AppWizardStepHero } from '@owox/ui/components/common/wizard';
import { RawBase64Icon } from '../../../../../../shared/icons';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';

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
      icon={<RawBase64Icon base64={connector.logoBase64} size={size} />}
      title={connector.displayName}
      docUrl={connector.docUrl}
      variant={variant}
    />
  );
}
