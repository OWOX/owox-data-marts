import chokidar from 'chokidar';
import { execSync } from 'child_process';

let isBuilding = false;
let pendingBuild = false;

function runBuild() {
  if (isBuilding) {
    pendingBuild = true;
    return;
  }

  isBuilding = true;
  console.log('🏗️  Building...');

  try {
    const output = execSync('vite build --config vite.config.js', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    console.log('✅ Build completed');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
  } finally {
    isBuilding = false;

    if (pendingBuild) {
      pendingBuild = false;
      setTimeout(() => runBuild(), 100);
    }
  }
}

console.log('🚀 Starting development mode...');

runBuild();

console.log('👀 Setting up file watcher...');

const watcher = chokidar.watch(['src/**/*.js', 'src/**/*.json'], {
  ignored: /node_modules/,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
  },
});

let timeout;
const debouncedBuild = () => {
  clearTimeout(timeout);
  timeout = setTimeout(() => runBuild(), 500);
};

watcher.on('change', filePath => {
  console.log(`🔄 File changed: ${filePath}`);
  debouncedBuild();
});

watcher.on('add', filePath => {
  console.log(`➕ File added: ${filePath}`);
  debouncedBuild();
});

watcher.on('unlink', filePath => {
  console.log(`🗑️  File removed: ${filePath}`);
  debouncedBuild();
});

console.log('✅ File watcher is active');
console.log('\n✨ Development server is ready!');
console.log('   Watching for file changes in src/');
console.log('   Press Ctrl+C to stop\n');

process.on('SIGINT', () => {
  console.log('\n👋 Stopping watcher...');
  watcher.close();
  process.exit(0);
});

setInterval(() => {}, 1000);
