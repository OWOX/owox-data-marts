// @ts-check
import markdownlintRules from './.markdownlint.json' with { type: 'json' };

const options = {
  globs: [
    '**/*.md', // Include all markdown files
    '!**/node_modules/**', // Exclude all node_modules folders
  ],
  config: markdownlintRules,
};

export default options;
