import type { ConnectorSpecificationResponseApiDto } from '../../../../../shared/api';

/** The auth section a bundled connector's Credential fills as a whole, variant included. */
export const AUTH_TYPE = 'AuthType';

const hasAttribute = (spec: ConnectorSpecificationResponseApiDto, attribute: string) =>
  spec.attributes?.includes(attribute) ?? false;

/** The parameters a bundled connector's Credential fills, as the server binds them. */
export function bundledKeyNames(specs: readonly ConnectorSpecificationResponseApiDto[]): string[] {
  if (specs.some(spec => spec.name === AUTH_TYPE && spec.oneOf?.length)) return [AUTH_TYPE];
  return specs
    .filter(spec => !hasAttribute(spec, 'HIDE_IN_CONFIG_FORM'))
    .filter(spec => hasAttribute(spec, 'SECRET') || hasAttribute(spec, 'CREDENTIAL'))
    .map(spec => spec.name);
}
