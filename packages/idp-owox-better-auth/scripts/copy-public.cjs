#!/usr/bin/env node
/* eslint-disable n/prefer-global/process */
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const publicSrcDir = path.join(rootDir, 'src', 'public');
const publicDistDir = path.join(rootDir, 'dist', 'public');
const templatesSrcDir = path.join(rootDir, 'src', 'resources', 'templates');
const templatesDistDir = path.join(rootDir, 'dist', 'resources', 'templates');

const copyRecursive = (from, to) => {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

// Copy public assets if they exist
if (fs.existsSync(publicSrcDir)) {
  fs.mkdirSync(publicDistDir, { recursive: true });
  copyRecursive(publicSrcDir, publicDistDir);
}

// Copy templates
if (fs.existsSync(templatesSrcDir)) {
  fs.mkdirSync(templatesDistDir, { recursive: true });
  copyRecursive(templatesSrcDir, templatesDistDir);
}
