#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_SKILLS_ROOT = path.join(ROOT, 'skills');
const SHARED_ROOT = process.env.AI_SHARED_SKILLS_DIR || path.join(os.homedir(), '.shared-agent-skills');
const args = process.argv.slice(2);
const force = args.includes('--force');
const all = args.includes('--all');
const isDryRun = args.includes('--dry-run');

const skills = args.filter(arg => !arg.startsWith('--'));

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

let selected = skills;

if (all) {
  selected = fs.readdirSync(LOCAL_SKILLS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

if (selected.length === 0) {
  console.error('Provide one or more skill names, or use --all.');
  process.exit(1);
}

ensureDir(SHARED_ROOT);

for (const skill of selected) {
  const sourceDir = path.join(LOCAL_SKILLS_ROOT, skill);
  const targetDir = path.join(SHARED_ROOT, skill);

  if (!fs.existsSync(path.join(sourceDir, 'SKILL.md'))) {
    console.error(`Missing local skill: ${skill}`);
    process.exit(1);
  }

  if (fs.existsSync(targetDir)) {
    if (!force) {
      console.log(`Skipped existing shared skill: ${skill}`);
      continue;
    }

    if (isDryRun) {
      console.log(`[dry-run] rm -rf ${targetDir}`);
    } else {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  }

  copyDir(sourceDir, targetDir);
  console.log(`Published ${skill} -> ${targetDir}`);
}
