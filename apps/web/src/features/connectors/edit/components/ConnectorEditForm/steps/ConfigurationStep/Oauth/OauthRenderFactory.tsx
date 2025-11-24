import type {
  ConnectorSpecificationOneOfResponseApiDto,
  ConnectorSpecificationResponseApiDto,
} from '../../../../../../shared/api/types';
import { useOAuth } from '../../../../../../shared/model/hooks/useOAuth';
import { FacebookOauthRender } from './impl/FacebookOauthRender';
import { useState, useEffect, useMemo } from 'react';
import type {
  OAuthStatusResponseDto,
  OAuthSettingsResponseDto,
} from '../../../../../../shared/api/types/response/oauth.response.dto';
import { Button } from '@owox/ui/components/button';
import { configurationFieldRender } from '../ConfigurationFieldRender';
import { AppWizardStepLabel } from '@owox/ui/components/common/wizard';

interface OauthRenderFactoryProps {
  specification: ConnectorSpecificationResponseApiDto;
  option?: ConnectorSpecificationOneOfResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  connectorName: string;
  onSecretEditToggle?: (name: string, enable: boolean) => void;
  secretEditing?: Record<string, boolean>;
  isEditingExisting?: boolean;
}

export interface OauthRenderComponentProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  connectorName: string;
  option?: ConnectorSpecificationOneOfResponseApiDto;
  isLoading: boolean;
  status: OAuthStatusResponseDto | null;
  settings: OAuthSettingsResponseDto | null;
  onOAuthSuccess: (credentials: Record<string, unknown>) => Promise<void>;
}

export function OauthRenderFactory({
  specification,
  option,
  configuration,
  onValueChange,
  connectorName,
  onSecretEditToggle,
  secretEditing = {},
  isEditingExisting = false,
}: OauthRenderFactoryProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<OAuthStatusResponseDto | null>(null);
  const [settings, setSettings] = useState<OAuthSettingsResponseDto | null>(null);

  const credentialId = useMemo(() => {
    const savedConfig = configuration[specification.name] as Record<string, unknown> | undefined;
    const configValue =
      option?.value && savedConfig
        ? (savedConfig[option.value] as Record<string, unknown>)
        : savedConfig;
    return configValue?._source_credential_id as string | undefined;
  }, [configuration, specification.name, option?.value]);

  const fieldPath = useMemo(() => {
    return option ? `${specification.name}.${option.value}` : specification.name;
  }, [specification.name, option]);

  const nestedConfiguration = useMemo(() => {
    const savedConfig = configuration[specification.name] as Record<string, unknown> | undefined;
    if (option?.value && savedConfig) {
      const nestedValue = savedConfig[option.value];
      // Ensure we return an object, not a primitive value
      if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
        return nestedValue as Record<string, unknown>;
      }
      return {};
    }

    if (savedConfig && typeof savedConfig === 'object' && !Array.isArray(savedConfig)) {
      return savedConfig;
    }
    return {};
  }, [configuration, specification.name, option?.value]);

  const detectedMode = useMemo(() => {
    const savedConfig = nestedConfiguration;

    if ('_source_credential_id' in savedConfig) {
      return false;
    }

    if (option?.items) {
      const hasManualFields = Object.keys(option.items).some(
        key => key in savedConfig && savedConfig[key] !== undefined && savedConfig[key] !== ''
      );
      if (hasManualFields) {
        return true;
      }
    }

    return false;
  }, [nestedConfiguration, option]);

  const [isManualMode, setIsManualMode] = useState(detectedMode);

  useEffect(() => {
    const hasOAuthCredential = '_source_credential_id' in nestedConfiguration;
    const hasManualFields =
      option?.items &&
      Object.keys(option.items).some(
        key =>
          key in nestedConfiguration &&
          nestedConfiguration[key] !== undefined &&
          nestedConfiguration[key] !== ''
      );

    if (hasOAuthCredential && isManualMode) {
      setIsManualMode(false);
    } else if (hasManualFields && !isManualMode) {
      setIsManualMode(true);
    }
  }, [nestedConfiguration, option, isManualMode]);

  const handleNestedValueChange = (itemName: string, value: unknown) => {
    if (!option?.value) return;

    const currentObjectValue = (
      configuration[specification.name] && typeof configuration[specification.name] === 'object'
        ? configuration[specification.name]
        : {}
    ) as Record<string, unknown>;

    onValueChange(specification.name, {
      ...currentObjectValue,
      [option.value]: {
        ...(typeof currentObjectValue[option.value] === 'object' &&
        currentObjectValue[option.value] !== null
          ? (currentObjectValue[option.value] as Record<string, unknown>)
          : {}),
        [itemName]: value,
      },
    });
  };

  const { checkStatus, getSettings, exchangeCredentials } = useOAuth();

  const handleOAuthSuccess = async (credentials: Record<string, unknown>) => {
    try {
      setIsLoading(true);
      const exchanged = await exchangeCredentials(connectorName, credentials, fieldPath);
      const currentConfig = configuration[specification.name] as
        | Record<string, unknown>
        | undefined;

      if (option) {
        onValueChange(specification.name, {
          ...currentConfig,
          [option.value]: {
            _source_credential_id: exchanged.credentialId,
          },
        });
      } else {
        onValueChange(specification.name, {
          _source_credential_id: exchanged.credentialId,
        });
      }
    } catch (error) {
      console.error('Failed to exchange OAuth credentials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!credentialId) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    const validateCredentials = async () => {
      try {
        setIsLoading(true);
        const fetchedStatus = await checkStatus(connectorName, credentialId);
        setStatus(fetchedStatus);
      } catch (error) {
        console.error('Failed to validate credentials:', error);
        setStatus({ valid: false });
      } finally {
        setIsLoading(false);
      }
    };
    void validateCredentials();
  }, [credentialId, connectorName, checkStatus]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const result = await getSettings(connectorName, fieldPath);
        setSettings(result);
      } catch (error) {
        console.error('Failed to fetch settings:', error);
        setSettings(null);
      }
    };
    void fetchSettings();
  }, [connectorName, fieldPath, getSettings]);

  if (isManualMode && option?.items) {
    return (
      <div className='space-y-4'>
        {Object.entries(option.items).map(([itemName, itemSpec]) => {
          const isSecret = Array.isArray(itemSpec.attributes)
            ? itemSpec.attributes.includes('SECRET')
            : false;
          const isSecretEditing = secretEditing[specification.name] ?? false;

          return (
            <div key={itemName} className='mb-4'>
              <div className='flex items-center justify-between'>
                <AppWizardStepLabel
                  htmlFor={itemName}
                  required={itemSpec.required}
                  tooltip={itemSpec.description}
                  className='mb-2 justify-start'
                >
                  {itemSpec.title ?? itemName}
                </AppWizardStepLabel>
                {isSecret && isEditingExisting && onSecretEditToggle && (
                  <Button
                    variant='ghost'
                    size='sm'
                    type='button'
                    onClick={() => {
                      onSecretEditToggle(specification.name, !isSecretEditing);
                    }}
                  >
                    {isSecretEditing ? 'Cancel' : 'Edit'}
                  </Button>
                )}
              </div>
              {configurationFieldRender({
                specification: { ...itemSpec, name: itemName },
                configuration: nestedConfiguration,
                onValueChange: (name, value) => {
                  handleNestedValueChange(name, value);
                },
                flags: {
                  isEditingExisting: isEditingExisting,
                  isSecret: isSecret,
                  isSecretEditing: isSecretEditing,
                },
                connectorName: connectorName,
              })}
            </div>
          );
        })}
        <Button
          variant='link'
          size='sm'
          type='button'
          onClick={() => {
            // Clear all manual fields when switching back to OAuth
            onValueChange(specification.name, {
              [option.value]: {},
            });
            setIsManualMode(false);
            setIsLoading(false);
          }}
          className='px-0'
        >
          Back to OAuth
        </Button>
      </div>
    );
  }

  // Render OAuth component based on connector
  const oauthComponent = (() => {
    switch (connectorName) {
      case 'FacebookMarketing':
        return (
          <FacebookOauthRender
            isLoading={isLoading}
            status={status}
            settings={settings}
            onOAuthSuccess={handleOAuthSuccess}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className='space-y-3'>
      {oauthComponent}
      {option?.items && Object.keys(option.items).length > 0 && (
        <Button
          variant='link'
          size='sm'
          type='button'
          onClick={() => {
            // Clear OAuth credential when switching to manual
            onValueChange(specification.name, {
              [option.value]: {},
            });
            setIsManualMode(true);
          }}
          className='px-0'
        >
          Manually
        </Button>
      )}
    </div>
  );
}
