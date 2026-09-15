/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * The Vite bundler strips `export` keywords when concatenating these files into
 * the single-scope bundle (see CommonConstants.js), so `export const X = ...`
 * becomes `const X = ...` there and bare references from bundled Sources keep
 * working. Outside the bundle the same source imports as ESM.
 */

export const GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD = 'generated_refresh_token';
export const GENERATED_REFRESH_TOKEN_CONFIG_FIELD = 'GeneratedRefreshToken';
