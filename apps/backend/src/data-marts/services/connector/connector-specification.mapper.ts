import { Core } from '@owox/connectors';

interface ConnectorSpecificationOneOf {
  label: string;
  value: string;
  requiredType: string;
  attributes?: Core.CONFIG_ATTRIBUTES[];
  oauthParams?: Record<string, unknown>;
  items: Record<string, ConnectorConfigField>;
}

interface ConnectorConfigField {
  description: string;
  label: string;
  default: unknown;
  requiredType: string;
  isRequired: boolean;
  options?: unknown[];
  placeholder?: string;
  minimum?: number;
  attributes?: Core.CONFIG_ATTRIBUTES[];
  optionsDependsOn?: string[];
  oneOf?: ConnectorSpecificationOneOf[];
}

export interface ConnectorConfig {
  [key: string]: ConnectorConfigField;
}

export function mapConnectorSpecification(config: ConnectorConfig) {
  const result = Object.keys(config).map(key => {
    const item = {
      ...mapConfigFieldToSchema(key, config[key]),
      oneOf: config[key].oneOf?.map(oneOf => {
        return {
          label: oneOf.label,
          value: oneOf.value,
          requiredType: oneOf.requiredType,
          attributes: oneOf.attributes,
          oauthParams: oneOf.oauthParams,
          items: Object.entries(oneOf.items).reduce(
            (acc, [itemKey, itemValue]) => {
              acc[itemKey] = mapConfigFieldToSchema(itemKey, itemValue);
              return acc;
            },
            {} as Record<string, unknown>
          ),
        };
      }),
    };
    return item;
  });
  return result;
}

/**
 * One parameter as the specification exposes it -- minus, for a SECRET parameter, the
 * three keys that carry a VALUE for the field rather than a description of it.
 *
 * The specification is the derived, viewer-readable half of the split
 * ConnectorDefinitionController draws: the manifest is @Auth(Role.editor()) because it is
 * author-written JSON
 * that may carry a literal credential, while the spec is served to every project member
 * on the grounds that it carries no part of the body. `default` broke that grounds outright -- the config form ASSIGNS it as the
 * parameter's value when the Data Mart has none (ConfigurationStep), so a `default` on a
 * SECRET parameter is not decoration, it is a working credential shipped to everyone who
 * can open the connector. The manifest grammar permits it and the builder's parameter
 * editor offers a "Default value" box on every parameter, secret ones included.
 *
 * `options` goes for the same reason and `placeholder` because it is author free text
 * rendered INSIDE the credential input (ConfigurationSecretField), which is exactly where
 * a token pasted out of a working `curl` lands. Neither has a cost worth keeping: a
 * SECRET parameter renders as a password box, so its `options` are never offered, and the
 * placeholder falls back to "Enter <field name>". No bundled connector sets any of the
 * three on a SECRET parameter.
 *
 * `title` and `description` deliberately stay. They are prose, nothing turns them into a
 * value, and stripping them would leave an unlabelled credential box; a credential typed
 * into a description is the same class of author mistake as one typed into `baseUrl`, and
 * the answer to that class is the publish-time warning, not blanking the whole form.
 *
 * Applied here rather than at each boundary so it is one choke point for every caller.
 * Nothing server-side reads a SECRET parameter's
 * default: ConnectorSecretService takes only names, attributes and `oneOf` from the spec.
 */
function mapConfigFieldToSchema(name: string, field: ConnectorConfigField) {
  const item = {
    name,
    title: field.label,
    description: field.description,
    default: field.default,
    requiredType: field.requiredType,
    required: field.isRequired,
    options: field.options,
    placeholder: field.placeholder,
    minimum: field.minimum,
    attributes: field.attributes,
    // Kept even for a SECRET field below: this names the fields whose values the option
    // lookup depends on, not a value of its own, so withholding it would only leave the
    // form unable to tell when the list needs reloading.
    optionsDependsOn: field.optionsDependsOn,
  };

  // The attributes are read AFTER ManifestParser has run, so this also covers the
  // parameters the parser marked SECRET on the author's behalf -- the common case, where
  // the author never typed the attribute at all.
  if (!(field.attributes ?? []).includes(Core.CONFIG_ATTRIBUTES.SECRET)) {
    return item;
  }
  return { ...item, default: undefined, options: undefined, placeholder: undefined };
}
