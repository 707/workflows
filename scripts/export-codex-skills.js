#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { CODEX_SKILLS } = require('./skill-sets');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_SKILLS_ROOT = path.join(ROOT, 'skills');
const SHARED_SKILLS_ROOT = process.env.AI_SHARED_SKILLS_DIR || path.join(os.homedir(), '.agent-skills');
const OUTPUT_ROOT = path.join(ROOT, '.agents', 'skills');
const isDryRun = process.argv.includes('--dry-run');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  if (isDryRun) {
    console.log(`[dry-run] remove ${dir}`);
    return;
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

function listEntries(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
}

function copyDir(sourceDir, targetDir) {
  if (isDryRun) {
    console.log(`[dry-run] copy ${sourceDir} -> ${targetDir}`);
    return;
  }

  ensureDir(targetDir);

  for (const entry of listEntries(sourceDir)) {
    const src = path.join(sourceDir, entry.name);
    const dest = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(src, dest);
      continue;
    }

    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function skillExists(rootDir, skillName) {
  return fs.existsSync(path.join(rootDir, skillName, 'SKILL.md'));
}

function resolveSource(skillName) {
  if (skillExists(LOCAL_SKILLS_ROOT, skillName)) {
    return path.join(LOCAL_SKILLS_ROOT, skillName);
  }

  if (skillExists(SHARED_SKILLS_ROOT, skillName)) {
    return path.join(SHARED_SKILLS_ROOT, skillName);
  }

  return null;
}

function titleize(name) {
  return name
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseDescription(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    return 'Shared skill';
  }

  const source = fs.readFileSync(skillFile, 'utf8');
  const match = source.match(/^description:\s*(.+)$/m);
  if (!match) {
    return 'Shared skill';
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function buildFallbackOpenAiYaml(skillName, skillDir) {
  return [
    'interface:',
    `  display_name: "${titleize(skillName)}"`,
    `  short_description: "${parseDescription(skillDir).replace(/"/g, '\\"')}"`,
    '  brand_color: "#3B82F6"',
    `  default_prompt: "Use the ${skillName} skill when it is relevant to the task"`,
    'policy:',
    '  allow_implicit_invocation: true',
    '',
  ].join('\n');
}

function writeFile(filePath, content) {
  if (isDryRun) {
    console.log(`[dry-run] write ${filePath}`);
    return;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function main() {
  removeDir(OUTPUT_ROOT);
  ensureDir(OUTPUT_ROOT);

  const missing = [];

  for (const skillName of CODEX_SKILLS) {
    const sourceDir = resolveSource(skillName);
    if (!sourceDir) {
      missing.push(skillName);
      continue;
    }

    const targetDir = path.join(OUTPUT_ROOT, skillName);
    copyDir(sourceDir, targetDir);

    const sourceMeta = path.join(sourceDir, 'agents', 'openai.yaml');
    const targetMeta = path.join(targetDir, 'agents', 'openai.yaml');
    if (!fs.existsSync(sourceMeta)) {
      writeFile(targetMeta, buildFallbackOpenAiYaml(skillName, sourceDir));
    }
  }

  if (missing.length > 0) {
    console.error(`Missing Codex skill sources: ${missing.join(', ')}`);
    console.error(`Checked local skills at ${LOCAL_SKILLS_ROOT} and shared skills at ${SHARED_SKILLS_ROOT}.`);
    process.exit(1);
  }

  console.log(`Exported ${CODEX_SKILLS.length} Codex skills to ${OUTPUT_ROOT}`);
  console.log(`Local skills source: ${LOCAL_SKILLS_ROOT}`);
  console.log(`Shared skills fallback: ${SHARED_SKILLS_ROOT}`);
}

main();
