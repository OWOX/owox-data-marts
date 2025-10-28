import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import type { ConnectorSpecificationResponseApiDto } from '../../../../shared/api';
import { StepperHeroBlock } from '../components';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppWizardStepSection,
  AppWizardStep,
  AppWizardStepHero,
  AppWizardStepLoading,
} from '@owox/ui/components/common/wizard';
import { OpenIssueLink } from '../components';
import { Unplug } from 'lucide-react';
import { SECRET_MASK } from '../../../../../../shared/constants/secrets';
import { ConfigurationListRender } from './ConfigurationStep/ConfigurationListRender';
import { CopyConfigurationButton } from '../../../../../data-marts/edit/components/DataMartDefinitionSettings/form/CopyConfigurationButton';
import type { CopiedConfiguration } from '../../../../../data-marts/edit/model/types';

interface ConfigurationStepProps {
  connector: ConnectorListItem;
  connectorSpecification: ConnectorSpecificationResponseApiDto[] | null;
  onConfigurationChange?: (configuration: Record<string, unknown>) => void;
  onValidationChange?: (isValid: boolean) => void;
  initialConfiguration?: Record<string, unknown>;
  loading?: boolean;
  isEditingExisting?: boolean;
}

export function ConfigurationStep({
  connector,
  connectorSpecification,
  onConfigurationChange,
  onValidationChange,
  initialConfiguration,
  loading = false,
  isEditingExisting = false,
}: ConfigurationStepProps) {
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({});
  const initializedRef = useRef(false);
  const updatingFromParentRef = useRef(false);
  const [secretEditing, setSecretEditing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (connectorSpecification) {
      updatingFromParentRef.current = true;

      const config: Record<string, unknown> = { ...(initialConfiguration ?? {}) };

      connectorSpecification.forEach(spec => {
        const isSecret = Array.isArray(spec.attributes)
          ? spec.attributes.includes('SECRET')
          : false;

        if (config[spec.name] === undefined && spec.default !== undefined) {
          config[spec.name] = spec.default;
        }

        if (isEditingExisting && isSecret) {
          config[spec.name] = SECRET_MASK;
        }
      });

      setConfiguration(config);
      initializedRef.current = true;
      setTimeout(() => {
        updatingFromParentRef.current = false;
      }, 0);
    }
  }, [connectorSpecification, initialConfiguration, isEditingExisting]);

  useEffect(() => {
    if (
      initializedRef.current &&
      initialConfiguration &&
      Object.keys(initialConfiguration).length > 0
    ) {
      updatingFromParentRef.current = true;
      setConfiguration({ ...initialConfiguration });
      setTimeout(() => {
        updatingFromParentRef.current = false;
      }, 0);
    }
  }, [initialConfiguration]);

  useEffect(() => {
    if (
      initializedRef.current &&
      !updatingFromParentRef.current &&
      Object.keys(configuration).length > 0
    ) {
      onConfigurationChange?.(configuration);
    }
  }, [configuration, onConfigurationChange]);

  const handleValueChange = (name: string, value: unknown) => {
    setConfiguration(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateValue = useCallback((value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;

    return true;
  }, []);

  const validateOneOfRecursive = useCallback(
    (value: unknown, spec: ConnectorSpecificationResponseApiDto): boolean => {
      if (typeof value !== 'object' || value === null) return validateValue(value);

      const oneOfs = spec.oneOf?.filter(
        oneOf => oneOf.value === Object.keys(value as Record<string, unknown>)[0]
      );
      if (oneOfs) {
        return oneOfs.every(oneOf =>
          Object.entries(oneOf.items).every(([, item]) => {
            if (oneOf.value in value) {
              return validateOneOfRecursive((value as Record<string, unknown>)[oneOf.value], item);
            }
            return false;
          })
        );
      }

      return validateValue((value as Record<string, unknown>)[spec.name]);
    },
    [validateValue]
  );

  const validateConfiguration = useCallback(
    (config: Record<string, unknown>, specs: ConnectorSpecificationResponseApiDto[]) => {
      const requiredOneOfSpecs = specs.filter(spec => spec.required && spec.oneOf);

      const isValidOneOf =
        requiredOneOfSpecs.length === 0
          ? true
          : requiredOneOfSpecs.some(spec => validateOneOfRecursive(config[spec.name], spec));

      const requiredSpecs = specs.filter(spec => spec.required && spec.name !== 'Fields');
      const isValidRequired = requiredSpecs.every(spec => validateValue(config[spec.name]));

      return isValidOneOf && isValidRequired;
    },
    [validateValue, validateOneOfRecursive]
  );

  const handleSecretEditToggle = (name: string, enable: boolean) => {
    setSecretEditing(prev => ({ ...prev, [name]: enable }));
    if (!enable) {
      setConfiguration(prev => ({ ...prev, [name]: SECRET_MASK }));
    } else {
      setConfiguration(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleCopyConfiguration = (copiedConfig: CopiedConfiguration) => {
    const newConfig: Record<string, unknown> = { ...configuration };

    Object.entries(copiedConfig.configuration).forEach(([key, value]) => {
      newConfig[key] = value;
    });

    newConfig._copiedFrom = {
      dataMartId: copiedConfig.dataMartId,
      dataMartTitle: copiedConfig.dataMartTitle,
      configIndex: copiedConfig.configIndex,
    };
    setConfiguration(newConfig);
  };

  useEffect(() => {
    if (connectorSpecification && onValidationChange) {
      const isValid = validateConfiguration(configuration, connectorSpecification);
      onValidationChange(isValid);
    }
  }, [configuration, connectorSpecification, onValidationChange, validateConfiguration]);

  if (loading) {
    return <AppWizardStepLoading variant='list' />;
  }

  if (!connectorSpecification || connectorSpecification.length === 0) {
    return (
      <AppWizardStep>
        <StepperHeroBlock connector={connector} />
        <AppWizardStepHero
          icon={<Unplug size={56} strokeWidth={1} />}
          title='No configuration found'
          subtitle='This connector might not be fully implemented yet or there could be other issues.'
        />
        <OpenIssueLink label='Need configuration?' />
      </AppWizardStep>
    );
  }

  // Sort specifications by priority:
  // 1. Required fields without default value
  // 2. Required fields with default value
  // 3. Non-required fields without default value
  // 4. All others (non-required with default value)
  const sortedSpecifications = [...connectorSpecification]
    .filter(spec => spec.name !== 'Fields' && !spec.attributes?.includes('HIDE_IN_CONFIG_FORM'))
    .sort((a, b) => {
      const getPriority = (spec: ConnectorSpecificationResponseApiDto) => {
        const hasDefault = spec.default != null && spec.default !== '';
        if (spec.required && !hasDefault) return 1;
        if (spec.required && hasDefault) return 2;
        if (!spec.required && !hasDefault) return 3;
        return 4;
      };

      return getPriority(a) - getPriority(b);
    });

  const requiredFields = sortedSpecifications.filter(
    spec => !spec.attributes?.includes('ADVANCED')
  );
  const advancedFields = sortedSpecifications.filter(spec => spec.attributes?.includes('ADVANCED'));

  return (
    <>
      <AppWizardStep>
        <StepperHeroBlock connector={connector} />
        <AppWizardStepSection>
          <div className='flex items-center justify-between'>
            <h3 className='text-muted-foreground/75 text-xs font-semibold tracking-wide uppercase'>
              Configure Settings
            </h3>
            <CopyConfigurationButton
              currentConnectorName={connector.name}
              onCopyConfiguration={handleCopyConfiguration}
              connectorSpecification={connectorSpecification}
            />
          </div>
          {requiredFields.length > 0 && (
            <ConfigurationListRender
              items={requiredFields}
              configuration={configuration}
              onValueChange={handleValueChange}
              onSecretEditToggle={handleSecretEditToggle}
              secretEditing={secretEditing}
              isEditingExisting={isEditingExisting}
            />
          )}
          {advancedFields.length > 0 && (
            <ConfigurationListRender
              collapsibleTitle='Advanced Settings'
              items={advancedFields}
              configuration={configuration}
              onValueChange={handleValueChange}
              onSecretEditToggle={handleSecretEditToggle}
              secretEditing={secretEditing}
              isEditingExisting={isEditingExisting}
            />
          )}
        </AppWizardStepSection>
      </AppWizardStep>
    </>
  );
}
