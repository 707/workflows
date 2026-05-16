#!/usr/bin/env node
/**
 * Codex Agent Generator
 *
 * Generates .codex/agents/{name}.toml from scripts/agent-config.json + models.json
 * for agents that declare a `codex` block. Codex's design favors read-only review
 * agents; we only emit Codex variants when an agent declares one (typically the
 * four promoted v1.2 agents: eval-harness, skill-stocktake, deep-research,
 * security-scan).
 *
 * Also updates .codex/config.toml's [agents.<name>] entries to reference the
 * generated TOML files.
 *
 * Usage:
 *   node scripts/gen-codex-assets.js
 *   node scripts/gen-codex-assets.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AI_AGENTS_DIR = path.join(ROOT, '.ai', 'agents');
const CODEX_AGENTS_DIR = path.join(ROOT, '.codex', 'agents');
const CODEX_CONFIG = path.join(ROOT, '.codex', 'config.toml');
const AGENT_CONFIG = path.join(ROOT, 'scripts', 'agent-config.json');
const MODELS_FILE = path.join(ROOT, 'models.json');

const isDryRun = process.argv.includes('--dry-run');

function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveCodexModel(role, models) {
  if (!role || !models?.roles?.[role]) return 'gpt-5.4';
  return models.roles[role].codex || 'gpt-5.4';
}

function readAgentBody(name) {
  const file = path.join(AI_AGENTS_DIR, `${name}.md`);
  if (!fs.existsSync(file)) return '';
  const raw = fs.readFileSync(file, 'utf8');
  return raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
}

function tomlEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
}

function generateCodexAgent(name, agentCfg, models) {
  const codex = agentCfg.codex;
  if (!codex) return null;

  const role = codex.role || agentCfg.claude?.role || 'fallback';
  const model = resolveCodexModel(role, models);
  const sandbox = codex.sandbox_mode || 'read-only';

  const body = readAgentBody(name);
  const instructions = body || codex.description || agentCfg.claude?.description || '';

  const fileName = codex.name || name.replace(/-/g, '_');
  const tomlPath = path.join(CODEX_AGENTS_DIR, `${fileName.replace(/_/g, '-')}.toml`);

  const content = [
    `# Generated from scripts/agent-config.json — do not edit by hand.`,
    `# Source: .ai/agents/${name}.md`,
    ``,
    `model = "${model}"`,
    `model_reasoning_effort = "${codex.reasoning_effort || 'high'}"`,
    `sandbox_mode = "${sandbox}"`,
    ``,
    `developer_instructions = """`,
    tomlEscape(instructions),
    `"""`,
    ``,
  ].join('\n');

  if (isDryRun) {
    console.log(`[dry-run] write ${tomlPath} (model=${model}, sandbox=${sandbox})`);
    return { fileName, tomlPath };
  }
  fs.writeFileSync(tomlPath, content, 'utf8');
  console.log(`  Written: ${tomlPath}`);
  return { fileName, tomlPath };
}

function updateConfigToml(generated) {
  if (!fs.existsSync(CODEX_CONFIG)) {
    console.warn(`[gen-codex-assets] ${CODEX_CONFIG} not found — skipping config.toml update`);
    return;
  }
  let content = fs.readFileSync(CODEX_CONFIG, 'utf8');

  for (const { fileName } of generated) {
    const key = fileName;
    const blockHeader = `[agents.${key}]`;
    if (content.includes(blockHeader)) continue;

    const description = `Generated harness agent.`;
    const newBlock = [
      ``,
      blockHeader,
      `description = "${description}"`,
      `config_file = "agents/${fileName.replace(/_/g, '-')}.toml"`,
      ``,
    ].join('\n');

    content += newBlock;
  }

  if (isDryRun) {
    console.log(`[dry-run] would append agents to ${CODEX_CONFIG}`);
    return;
  }
  fs.writeFileSync(CODEX_CONFIG, content, 'utf8');
  console.log(`  Updated: ${CODEX_CONFIG}`);
}

function main() {
  const config = loadJson(AGENT_CONFIG);
  const models = loadJson(MODELS_FILE);
  if (!config) {
    console.error('Error: agent-config.json not found');
    process.exit(1);
  }

  ensureDir(CODEX_AGENTS_DIR);

  const generated = [];
  for (const [name, agentCfg] of Object.entries(config)) {
    if (!agentCfg.codex) continue;
    console.log(`${name}:`);
    const result = generateCodexAgent(name, agentCfg, models);
    if (result) generated.push(result);
  }

  if (generated.length) {
    updateConfigToml(generated);
  }

  console.log(`\nDone. Generated ${generated.length} Codex agent(s).`);
  if (isDryRun) console.log(`[dry-run] No files written.`);
}

main();
