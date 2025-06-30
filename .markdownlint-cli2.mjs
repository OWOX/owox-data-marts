// @ts-check
import markdownlintRules from './.markdownlint.json' with { type: 'json' };

const args = process.argv.slice(2);
const hasFileArguments = args.some(arg => !arg.startsWith('-'));

const options = {
  config: markdownlintRules,
};

if (!hasFileArguments) {
  options.globs = [
    '**/*.md', // Include all markdown files
    '!**/node_modules/**', // Exclude all node_modules folders
  ];
}

export default options;
