import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * The license text every source file must open with. CREATING_CONNECTOR.md
 * prescribes it in both scaffold templates, but nothing enforced it: `src/**` was
 * excluded from linting entirely (see `ignores` below), so 47 files -- including
 * every one of the 37 new Declarative/Events engine files -- drifted without a
 * conforming header and no check noticed.
 */
const REQUIRED_HEADER_PHRASES = [
  'Copyright (c) OWOX, Inc.',
  'For the full copyright and license information, please view the LICENSE',
  'file that was distributed with this source code.',
];

/**
 * Zero-dependency license-header rule, defined inline rather than pulled from a
 * plugin so enforcing a house convention does not add a dependency (and a
 * lockfile change) to this package.
 *
 * Deliberately not auto-fixable: inserting a copyright notice is a licensing
 * assertion, so it should be a considered edit rather than something a
 * `--fix` sweep does silently.
 */
const owoxPlugin = {
  rules: {
    'license-header': {
      meta: {
        type: 'problem',
        docs: { description: 'require the OWOX copyright header at the top of each source file' },
        schema: [],
      },
      create(context) {
        return {
          Program(node) {
            let text = context.sourceCode.getText();
            // A shebang legitimately precedes the header (src/connector-runner.js
            // is an executable entry point and must keep #! on line 1).
            if (text.startsWith('#!')) {
              text = text.slice(text.indexOf('\n') + 1);
            }
            const trimmed = text.replace(/^\s+/, '');
            const end = trimmed.startsWith('/*') ? trimmed.indexOf('*/') : -1;
            if (end !== -1) {
              // Flatten the leading block comment to one whitespace-normalized
              // string, so the check tolerates the two harmless variations that
              // already exist in the tree: extra indentation before the leading
              // `*`, and a file-specific note appended inside the SAME block
              // after the license text. It is the licensing assertion that must
              // be present and verbatim, not the comment's exact shape.
              const body = trimmed
                .slice(0, end)
                .split('\n')
                .map(line => line.replace(/^\s*\/?\*+/, '').trim())
                .join(' ');
              if (REQUIRED_HEADER_PHRASES.every(phrase => body.includes(phrase))) return;
            }
            context.report({
              node,
              message:
                'Missing the OWOX copyright header. Add the block from CREATING_CONNECTOR.md at the top of the file (after any shebang).',
            });
          },
        };
      },
    },
  },
};

export default [
  // Configuration for CommonJS files in src/
  //
  // NOTE: `src/**` is intentionally NOT given `js.configs.recommended.rules`.
  // Those rules have never actually run here -- the ignore list below excluded
  // the whole source tree -- and switching them on reports ~4,400 pre-existing
  // problems across 206 files (mostly `no-undef` from the bundle's
  // concatenate-into-one-scope model, which this flat config does not describe).
  // Cleaning that up is its own piece of work; it must not be a side effect of
  // enforcing the license header, so this block carries the header rule only.
  //
  // `no-undef` ALONE was measured separately, since it is the rule that would
  // catch a call to a helper the bundle no longer defines (which is how
  // GoogleSheets shipped three `HttpUtils.fetch` calls after that util was
  // deleted). Declaring the real bundle globals -- the top-level bindings of the
  // generated build/index.js, plus the SDKs connector-runner.js assigns onto
  // `global` -- brings it from ~4,400 to 143. It is still not worth turning on:
  //
  //   142  src/Sources/**   one structural pattern, not 142 problems. The build
  //                         concatenates each connector's own files into that
  //                         connector's IIFE, so Source.js reads its sibling
  //                         `<Name>FieldsSchema` / `<Name>Helper` as a bare
  //                         global. A flat globals list cannot express "visible
  //                         only inside this connector" without a hand-kept name
  //                         list per connector, which would drift into false reds
  //                         every time a connector gains a helper.
  //     1  src/Storages/**  a genuine bug, not noise: AwsRedshiftStorage's
  //                         getColumnType() default branch interpolates a bare
  //                         `type` instead of `field.type`, so the "Unknown type"
  //                         path throws a ReferenceError instead of its message.
  //                         Pre-existing on main.
  //     0  src/Core/**, src/Constants/**
  //
  // The clean subtree is also the one where the rule buys least: Core reaches for
  // only two bare globals (LOG_LEVEL, AdmZip) and imports everything else, so it
  // is already covered. Enabling `no-undef` just there would have caught neither
  // the HttpUtils bug (in Sources) nor the SsrfGuard one (a top-level `import` the
  // BUILD strips -- present and resolvable in source, so no-undef sees nothing
  // wrong). Catching that second class needs a check against dist/, not a linter.
  //
  // The real fix for the 142 is to let a connector's files import their siblings
  // the way every Source.js already imports AbstractSource: the build strips those
  // lines anyway, so they cost nothing at runtime and make the tree statically
  // analysable. That is a per-connector refactor, not a config change.
  {
    files: ['src/**/*.js'],
    plugins: { owox: owoxPlugin },
    linterOptions: {
      // src/ carries ~13 `eslint-disable` comments for `no-console`,
      // `no-unused-vars` and `no-undef`. Those rules are not enabled here (see
      // the note below), so ESLint would report every one of those directives as
      // unused. They are not wrong -- they are dormant, and they become live
      // again the moment the recommended set is switched on. Deleting valid
      // directives to silence a warning caused by our own narrow scoping would
      // be the wrong trade, so the check is off for this block only.
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 2022,
      // `module`, not `commonjs`: package.json declares "type": "module" and the
      // source tree is ESM. The old `commonjs` value was inert (src was ignored)
      // and, once src became lintable, turned every `import` into a parsing
      // error. The handful of `require()` calls that remain in ESM files parse
      // fine either way -- they are ordinary call expressions.
      sourceType: 'module',
    },
    rules: {
      'owox/license-header': 'error',
    },
  },
  // Configuration for ES modules at root level
  // Apply prettier config to all files
  eslintConfigPrettier,
  // Ignore patterns
  //
  // `src/**/*` was removed from this list so the header rule above can actually
  // see the source tree. src/Templates/ is covered too and already complies --
  // the scaffolds carry the header that CREATING_CONNECTOR.md tells authors to
  // copy, so the rule keeps them honest rather than exempting them.
  {
    ignores: ['dist/**', 'node_modules/**', 'build/**'],
  },
];
