#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AI_AGENTS_DIR = path.join(ROOT, '.ai', 'agents');
const CLAUDE_COMMANDS_DIR = path.join(ROOT, '.claude', 'commands');
const OPENCODE_PROMPTS_DIR = path.join(ROOT, '.opencode', 'prompts', 'agents');
const OPENCODE_COMMANDS_DIR = path.join(ROOT, '.opencode', 'commands');
const OPENCODE_CONFIG = path.join(ROOT, '.opencode', 'opencode.json');
const AGENT_CONFIG = path.join(ROOT, 'scripts', 'agent-config.json');
const MODELS_FILE = path.join(ROOT, 'models.json');
const isDryRun = process.argv.includes('--dry-run');

function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) {
    console.warn(`[gen-opencode-assets] Failed to parse ${file}: ${err.message}`);
    return null;
  }
}

function resolveOpencodeModel(role, models) {
  if (!role || !models || !models.roles || !models.roles[role]) return null;
  return models.roles[role].opencode || null;
}

const COMMAND_AGENT_MAP = {
  'build-fix': 'build-error-resolver',
  'code-review': 'code-reviewer',
  e2e: 'e2e-runner',
  'harness-audit': 'harness-optimizer',
  plan: 'planner',
  'refactor-clean': 'refactor-cleaner',
  tdd: 'tdd-guide',
  verify: 'code-reviewer',
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (isDryRun) {
      console.log(`[dry-run] mkdir -p ${dir}`);
      return;
    }

    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  if (isDryRun) {
    console.log(`[dry-run] write ${filePath}`);
    return;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/u, '');
}

function parseDescription(content) {
  const match = content.match(/^description:\s*(.+)$/m);
  if (!match) {
    return 'project-template command';
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function listMarkdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort();
}

function generateAgentPrompts() {
  for (const fileName of listMarkdownFiles(AI_AGENTS_DIR)) {
    const name = fileName.replace(/\.md$/u, '');
    const source = readFile(path.join(AI_AGENTS_DIR, fileName)).trimEnd();
    const outputFile = path.join(OPENCODE_PROMPTS_DIR, `${name}.txt`);
    writeFile(outputFile, `${source}\n`);
  }
}

function buildCommandFrontmatter(name, description) {
  const lines = ['---', `description: ${description}`];
  const agent = COMMAND_AGENT_MAP[name];
  if (agent) {
    lines.push(`agent: ${agent}`);
    lines.push('subtask: true');
  }
  lines.push('---', '');
  return lines.join('\n');
}

function generateCommands() {
  for (const fileName of listMarkdownFiles(CLAUDE_COMMANDS_DIR)) {
    const name = fileName.replace(/\.md$/u, '');
    const source = readFile(path.join(CLAUDE_COMMANDS_DIR, fileName));
    const description = parseDescription(source);
    const body = stripFrontmatter(source).trim();
    const output = [
      buildCommandFrontmatter(name, description),
      `# ${name}`,
      '',
      'This OpenCode command mirrors the corresponding project-template Claude command.',
      'Follow the same ticket-context workflow and repository guardrails.',
      '',
      body,
      '',
    ].join('\n');
    const outputFile = path.join(OPENCODE_COMMANDS_DIR, `${name}.md`);
    writeFile(outputFile, output);
  }
}

function regenerateOpencodeAgents() {
  const config = loadJson(AGENT_CONFIG);
  const models = loadJson(MODELS_FILE);
  const oc = loadJson(OPENCODE_CONFIG);
  if (!config || !oc) {
    console.warn('[gen-opencode-assets] Skipping opencode.json regen — missing inputs');
    return;
  }

  const primary = (oc.agent && oc.agent.build) || {
    description: 'Primary coding agent for project-template work.',
    mode: 'primary',
    model: models?.roles?.execute?.opencode || 'anthropic/claude-sonnet-4-6',
    tools: { write: true, edit: true, bash: true, read: true },
  };

  const nextAgents = { build: primary };

  for (const [name, agentCfg] of Object.entries(config)) {
    const ocCfg = agentCfg.opencode || {};
    const role = ocCfg.role || agentCfg.claude?.role || 'fallback';
    const resolved = resolveOpencodeModel(role, models);

    const claudeTools = new Set(agentCfg.claude?.tools || []);
    const writeAllowed = ocCfg.tools?.write ?? (claudeTools.has('Write') || claudeTools.has('Edit'));
    const editAllowed = ocCfg.tools?.edit ?? (claudeTools.has('Edit') || claudeTools.has('Write'));
    const bashAllowed = ocCfg.tools?.bash ?? claudeTools.has('Bash');
    const readAllowed = ocCfg.tools?.read ?? (claudeTools.has('Read') || true);

    nextAgents[name] = {
      description: ocCfg.description || agentCfg.claude?.description || '',
      mode: ocCfg.mode || 'subagent',
      model: resolved || primary.model,
      prompt: `{file:prompts/agents/${name}.txt}`,
      tools: {
        read: readAllowed,
        bash: bashAllowed,
        write: writeAllowed,
        edit: editAllowed,
        ...(ocCfg.tools?.webfetch ? { webfetch: true } : {}),
      },
    };
  }

  oc.agent = nextAgents;
  if (models?.roles?.execute?.opencode) oc.model = models.roles.execute.opencode;
  if (models?.roles?.observe?.opencode) oc.small_model = models.roles.observe.opencode;

  if (isDryRun) {
    console.log(`[dry-run] would update ${OPENCODE_CONFIG} (${Object.keys(nextAgents).length} agents)`);
    return;
  }
  fs.writeFileSync(OPENCODE_CONFIG, JSON.stringify(oc, null, 2) + '\n', 'utf8');
  console.log(`[gen-opencode-assets] Updated ${OPENCODE_CONFIG} (${Object.keys(nextAgents).length} agents)`);
}

function main() {
  ensureDir(OPENCODE_PROMPTS_DIR);
  ensureDir(OPENCODE_COMMANDS_DIR);
  generateAgentPrompts();
  generateCommands();
  regenerateOpencodeAgents();

  const mode = isDryRun ? 'dry-run' : 'apply';
  console.log(`[gen-opencode-assets] Completed in ${mode} mode`);
}

main();
