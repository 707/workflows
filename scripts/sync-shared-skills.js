#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);

function readFlag(flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return args[index + 1] || null;
}

const sourceRoot = readFlag('--source') || process.env.AI_SHARED_SKILLS_DIR || path.join(os.homedir(), '.agent-skills');
const targetRoot = readFlag('--target') || process.env.AI_GLOBAL_SKILLS_DIR || path.join(os.homedir(), '.agents', 'skills');
const mode = readFlag('--mode') || 'link';
const force = args.includes('--force');
const isDryRun = args.includes('--dry-run');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (isDryRun) {
      console.log(`[dry-run] mkdir -p ${dir}`);
      return;
    }

    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDir(sourceDir, targetDir) {
  if (isDryRun) {
    console.log(`[dry-run] copy ${sourceDir} -> ${targetDir}`);
    return;
  }

  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function linkDir(sourceDir, targetDir) {
  if (isDryRun) {
    console.log(`[dry-run] ln -s ${sourceDir} ${targetDir}`);
    return;
  }

  fs.symlinkSync(sourceDir, targetDir, 'dir');
}

function removeTarget(targetDir) {
  if (isDryRun) {
    console.log(`[dry-run] rm -rf ${targetDir}`);
    return;
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
}

function sameLink(targetDir, sourceDir) {
  if (!fs.existsSync(targetDir) || !fs.lstatSync(targetDir).isSymbolicLink()) {
    return false;
  }

  const actual = fs.readlinkSync(targetDir);
  const resolved = path.resolve(path.dirname(targetDir), actual);
  return resolved === sourceDir;
}

if (!fs.existsSync(sourceRoot)) {
  console.log(`Shared skills source does not exist: ${sourceRoot}`);
  console.log('Nothing to sync.');
  process.exit(0);
}

ensureDir(targetRoot);

const skills = fs.readdirSync(sourceRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

for (const skill of skills) {
  const sourceDir = path.join(sourceRoot, skill);
  const targetDir = path.join(targetRoot, skill);

  if (!fs.existsSync(path.join(sourceDir, 'SKILL.md'))) {
    console.log(`Skipping ${skill}: missing SKILL.md`);
    continue;
  }

  if (fs.existsSync(targetDir)) {
    if (sameLink(targetDir, sourceDir)) {
      console.log(`Unchanged: ${skill}`);
      continue;
    }

    if (!force) {
      console.log(`Skipped existing target: ${skill}`);
      continue;
    }

    removeTarget(targetDir);
  }

  ensureDir(path.dirname(targetDir));

  if (mode === 'copy') {
    copyDir(sourceDir, targetDir);
  } else if (mode === 'link') {
    linkDir(sourceDir, targetDir);
  } else {
    console.error(`Unsupported mode: ${mode}`);
    process.exit(1);
  }

  console.log(`Synced ${skill} -> ${targetDir}`);
}
