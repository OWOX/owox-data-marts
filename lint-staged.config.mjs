/**
 * Wrapper file for lint-staged configuration from @owox/linter-config package.
 *
 * This minimal wrapper is required because lint-staged expects 'export default',
 * while our package uses named exports for better tree-shaking.
 */
import { config } from '@owox/linter-config/lint-staged';

export default config;
