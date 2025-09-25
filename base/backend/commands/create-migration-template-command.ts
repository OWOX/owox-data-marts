import { execSync } from 'child_process';

const name = process.argv[2] || 'new-migration';

execSync(`npx typeorm-ts-node-commonjs migration:create ./src/migrations/${name}`, {
  stdio: 'inherit',
});
