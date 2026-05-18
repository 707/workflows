#!/usr/bin/env node
/**
 * Agent Generator
 *
 * Generates platform-specific agent files from the shared source in .ai/agents/.
 * Each agent body is stored once in .ai/agents/{name}.md (no frontmatter).
 * Per-platform frontmatter is defined in scripts/agent-config.json.
 *
 * Outputs:
 *   .claude/agents/{name}.md  — Claude Code agents
 *   .gemini/agents/{name}.md  — Gemini CLI agents
 *
 * Usage:
 *   node scripts/gen-agents.js
 *   node scripts/gen-agents.js --dry-run   (preview only, no writes)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AI_AGENTS_DIR = path.join(ROOT, '.ai', 'agents');
const CLAUDE_AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const GEMINI_AGENTS_DIR = path.join(ROOT, '.gemini', 'agents');
const CONFIG_FILE = path.join(__dirname, 'agent-config.json');
const MODELS_FILE = path.join(ROOT, 'models.json');

const isDryRun = process.argv.includes('--dry-run');

function loadModels() {
  if (!fs.existsSync(MODELS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
  } catch (err) {
    console.warn(`[gen-agents] Failed to parse ${MODELS_FILE}: ${err.message}`);
    return null;
  }
}

/**
 * Resolve a config block's `role` into a concrete `model` field using models.json.
 *
 * Precedence: explicit `model` (kept) > role lookup > existing model > unset.
 * The `role` field is stripped from the emitted frontmatter (Claude/Gemini don't
 * understand it).
 *
 * Platform = 'claude' uses roles[r].model; 'gemini' uses roles[r].gemini.
 */
function resolveRole(config, platform, models) {
  const out = { ...config };
  const role = out.role;
  delete out.role;
  if (!role) return out;
  if (!models || !models.roles || !models.roles[role]) return out;
  // Routing disabled by default — agents emit no `model:` field and each tool
  // uses its harness default. Flip routing_enabled to true in models.json to
  // apply the per-role mapping.
  if (models.routing_enabled !== true) return out;
  const roleCfg = models.roles[role];
  const resolved = platform === 'gemini' ? roleCfg.gemini : roleCfg.model;
  if (resolved && !out.model) out.model = resolved;
  return out;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildFrontmatter(config) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(config)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(v => `"${v}"`).join(', ')}]`);
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function generateAgent(name, body, platformConfig, outputDir) {
  const frontmatter = buildFrontmatter(platformConfig);
  const content = `${frontmatter}\n\n${body.trimStart()}`;
  const outputFile = path.join(outputDir, `${name}.md`);

  if (isDryRun) {
    console.log(`[dry-run] Would write: ${outputFile}`);
    console.log(`  Frontmatter keys: ${Object.keys(platformConfig).join(', ')}`);
    return;
  }

  fs.writeFileSync(outputFile, content, 'utf8');
  console.log(`  Written: ${outputFile}`);
}

function main() {
  // Read config
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`Error: Config file not found: ${CONFIG_FILE}`);
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const models = loadModels();
  if (models) {
    console.log(`Loaded models.json — ${Object.keys(models.roles || {}).length} role(s) available for resolution.\n`);
  } else {
    console.log(`No models.json found — agents will use any explicit "model" field as-is.\n`);
  }

  // Ensure output dirs exist
  if (!isDryRun) {
    ensureDir(CLAUDE_AGENTS_DIR);
    ensureDir(GEMINI_AGENTS_DIR);
  }

  const agentNames = Object.keys(config);
  console.log(`Generating ${agentNames.length} agents for 2 platforms...\n`);

  let claudeCount = 0;
  let geminiCount = 0;
  const errors = [];

  for (const name of agentNames) {
    const sourceFile = path.join(AI_AGENTS_DIR, `${name}.md`);

    if (!fs.existsSync(sourceFile)) {
      errors.push(`Missing source: ${sourceFile}`);
      continue;
    }

    // Strip any frontmatter from the source body — frontmatter is owned by
    // agent-config.json. Body files may include their own frontmatter as a
    // reading convenience (so the .ai/agents/*.md file is self-describing),
    // but it must not be emitted twice.
    const body = fs.readFileSync(sourceFile, 'utf8').replace(/^---\n[\s\S]*?\n---\n*/, '');
    const agentConfig = config[name];

    console.log(`${name}:`);

    // Generate Claude agent — resolve role to model from models.json
    if (agentConfig.claude) {
      const resolved = resolveRole(agentConfig.claude, 'claude', models);
      generateAgent(name, body, resolved, CLAUDE_AGENTS_DIR);
      claudeCount++;
    }

    // Generate Gemini agent — resolve role to gemini-specific model
    if (agentConfig.gemini) {
      const resolved = resolveRole(agentConfig.gemini, 'gemini', models);
      generateAgent(name, body, resolved, GEMINI_AGENTS_DIR);
      geminiCount++;
    }
  }

  console.log(`\nDone.`);
  if (isDryRun) {
    console.log(`[dry-run] No files written.`);
  } else {
    console.log(`  Claude agents: ${claudeCount} → ${CLAUDE_AGENTS_DIR}`);
    console.log(`  Gemini agents: ${geminiCount} → ${GEMINI_AGENTS_DIR}`);
  }

  if (errors.length > 0) {
    console.error('\nErrors:');
    for (const err of errors) {
      console.error(`  ${err}`);
    }
    process.exit(1);
  }
}

main();
