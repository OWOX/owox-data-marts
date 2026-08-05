import { config } from '@owox/eslint-config/node';

export default [
  ...config,
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.test.ts', '**/*.spec.ts', '*.config.js'],
  },
  {
    // This package ships into a plugin iframe as well as into Node, and a single
    // Node-only import is enough to break the browser build. The failure surfaces far
    // from its cause -- a bundler error in a plugin, not here -- so it is worth
    // catching at the point someone writes it.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message:
                'Node built-ins do not exist in a plugin iframe. Use a web-standard API, or keep the Node-only path in the consumer (see how owox-ctl supplies streamDispatcher).',
            },
          ],
          paths: [
            {
              name: 'undici',
              message:
                'undici is Node-only. Accept a dispatcher through OWOXApiClientOptions instead; owox-ctl provides one.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'Buffer',
          message: 'Buffer is Node-only. Use encodeBase64Url/decodeBase64Url from base64url.ts.',
        },
      ],
    },
  },
];
