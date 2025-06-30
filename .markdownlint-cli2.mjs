// @ts-check
import markdownlintRules from './.markdownlint.json' with { type: 'json' };

const args = process.argv.slice(2);

let hasFileArguments = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--config') {
    i++; // Skip next element
    continue;
  }

  if (!arg.startsWith('-')) {
    hasFileArguments = true;
    break;
  }
}

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
