#!/usr/bin/env node
/**
 * update-skills-index.js
 *
 * Scans skills/*\/SKILL.md, categorizes each skill by stack, and regenerates
 * skills/INDEX.md. Run manually after adding/removing skill folders, or use
 * the /update-skills command. Also triggered automatically by a hook whenever
 * Claude writes a skills/*\/SKILL.md file.
 *
 * Stack categorization priority:
 *   1. Built-in DEFAULT_STACKS map (covers all 52 shipped skills)
 *   2. `stack:` field in the skill's YAML frontmatter
 *   3. Falls back to 'uncategorized' with a warning
 *
 * New skills: include `stack: <value>` in your SKILL.md frontmatter.
 * Valid values: web, python, go, java, swift, cpp, database, general
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SKILLS_DIR = path.resolve(__dirname, '../skills');
const INDEX_PATH = path.join(SKILLS_DIR, 'INDEX.md');

const STACK_ORDER = ['web', 'python', 'go', 'java', 'swift', 'cpp', 'database', 'general', 'uncategorized'];

const STACK_LABELS = {
  web:          'Web / TypeScript / JavaScript',
  python:       'Python',
  go:           'Go',
  java:         'Java / Spring Boot',
  swift:        'Swift / iOS',
  cpp:          'C++',
  database:     'Database',
  general:      'General / Cross-stack',
  uncategorized: 'Uncategorized (add `stack:` to SKILL.md frontmatter)',
};

// Built-in map for all 61 shipped skills. New skills added by users should
// include a `stack:` field in their SKILL.md frontmatter instead.
const DEFAULT_STACKS = {
  // web
  'api-design':                    'web',
  'backend-patterns':              'web',
  'coding-standards':              'web',
  'composition-patterns':          'web',
  'content-hash-cache-pattern':    'web',
  'database-migrations':           'web',
  'deployment-patterns':           'web',
  'docker-patterns':               'web',
  'e2e-testing':                   'web',
  'frontend-patterns':             'web',
  'react-best-practices':          'web',
  'web-design-guidelines':         'web',
  // python
  'django-patterns':               'python',
  'django-security':               'python',
  'django-tdd':                    'python',
  'django-verification':           'python',
  'python-patterns':               'python',
  'python-testing':                'python',
  // go
  'golang-patterns':               'go',
  'golang-testing':                'go',
  // java
  'java-coding-standards':         'java',
  'jpa-patterns':                  'java',
  'springboot-patterns':           'java',
  'springboot-security':           'java',
  'springboot-tdd':                'java',
  'springboot-verification':       'java',
  // swift
  'foundation-models-on-device':   'swift',
  'liquid-glass-design':           'swift',
  'swift-actor-persistence':       'swift',
  'swift-concurrency-6-2':         'swift',
  'swift-protocol-di-testing':     'swift',
  'swiftui-patterns':              'swift',
  // cpp
  'cpp-coding-standards':          'cpp',
  'cpp-testing':                   'cpp',
  // database
  'clickhouse-io':                 'database',
  'postgres-patterns':             'database',
  // general
  'configure-ecc':                 'general',
  'continuous-learning':           'general',
  'continuous-learning-v2':        'general',
  'cost-aware-llm-pipeline':       'general',
  'eval-harness':                  'general',
  'iterative-retrieval':           'general',
  'nutrient-document-processing':  'general',
  'project-guidelines-example':    'general',
  'regex-vs-llm-structured-text':  'general',
  'search-first':                  'general',
  'security-review':               'general',
  'security-scan':                 'general',
  'skill-stocktake':               'general',
  'strategic-compact':             'general',
  'tdd-workflow':                  'general',
  'verification-loop':             'general',
  'visa-doc-translate':            'general',
  // general (v1.8.0 additions)
  'agent-harness-construction':    'general',
  'agentic-engineering':           'general',
  'ai-first-engineering':          'general',
  'article-writing':               'general',
  'content-engine':                'general',
  'continuous-agent-loop':         'general',
  'enterprise-agent-ops':          'general',
  'market-research':               'general',
  'ralphinho-rfc-pipeline':        'general',
};

// ---------------------------------------------------------------------------
// YAML frontmatter parser (no dependencies)
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`skills/ directory not found at ${SKILLS_DIR}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => name !== 'INDEX.md'); // guard

  const grouped = {};
  for (const stack of STACK_ORDER) grouped[stack] = [];

  const uncategorized = [];

  for (const folder of entries.sort()) {
    const skillPath = path.join(SKILLS_DIR, folder, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    const content = fs.readFileSync(skillPath, 'utf8');
    const fm = parseFrontmatter(content);

    const name = fm.name || folder;
    const description = fm.description || '—';

    // Categorize: built-in map first, then frontmatter `stack:` field
    let stack = DEFAULT_STACKS[folder];
    if (!stack && fm.stack) {
      stack = fm.stack.toLowerCase().trim();
    }
    if (!stack || !STACK_ORDER.includes(stack)) {
      stack = 'uncategorized';
      uncategorized.push(folder);
    }

    grouped[stack].push({ folder, name, description });
  }

  // ---------------------------------------------------------------------------
  // Build INDEX.md content
  // ---------------------------------------------------------------------------

  const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const lines = [];

  lines.push('# Skills Index');
  lines.push('');
  lines.push('> Auto-generated — do not edit directly.');
  lines.push('> To update: run `node scripts/update-skills-index.js` or use `/update-skills`.');
  lines.push(`> Last updated: ${now}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Skill Scope Rule');
  lines.push('');
  lines.push('Skills are **opt-in** based on your declared tech stack, not opt-out from the directory.');
  lines.push('');
  lines.push('- Check §4 (Tech Stack) of `CLAUDE.md` to see which technologies are declared for this project.');
  lines.push('- Only use skills from the matching section(s) below.');
  lines.push('- Skills under a different stack header (e.g., Swift, Java) are **not applicable** unless that stack is in §4.');
  lines.push('');
  lines.push('---');
  lines.push('');

  let totalSkills = 0;
  const stackCounts = {};

  for (const stack of STACK_ORDER) {
    const skills = grouped[stack];
    if (!skills || skills.length === 0) continue;

    stackCounts[stack] = skills.length;
    totalSkills += skills.length;

    lines.push(`## ${STACK_LABELS[stack]}`);
    lines.push('');
    lines.push('| Skill | Description |');
    lines.push('|-------|-------------|');
    for (const { folder, description } of skills) {
      lines.push(`| \`${folder}\` | ${description} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Adding New Skills');
  lines.push('');
  lines.push('1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter:');
  lines.push('   ```yaml');
  lines.push('   name: skill-name');
  lines.push('   description: What this skill covers (≤ 500 chars)');
  lines.push('   stack: web   # web | python | go | java | swift | cpp | database | general');
  lines.push('   origin: ECC');
  lines.push('   ```');
  lines.push('2. Use the Hermes 4-section body template:');
  lines.push('   ```markdown');
  lines.push('   ## When to Use');
  lines.push('   [trigger conditions — be specific about which tasks activate this]');
  lines.push('');
  lines.push('   ## Procedure');
  lines.push('   [the steps the agent should take when this skill applies]');
  lines.push('');
  lines.push('   ## Pitfalls');
  lines.push('   [things that bite when applying this — REQUIRED]');
  lines.push('');
  lines.push('   ## Verification');
  lines.push('   [how the agent will know the skill worked — REQUIRED]');
  lines.push('   ```');
  lines.push('3. Run `/update-skills` (or `node scripts/update-skills-index.js`).');
  lines.push('4. INDEX.md is regenerated automatically.');
  lines.push('5. Validate with `node scripts/validate-additions.js` before committing.');
  lines.push('');
  lines.push('## Decide: skill or agent?');
  lines.push('');
  lines.push('| Pattern shape | Skill | Agent |');
  lines.push('|---|---|---|');
  lines.push('| Turns per occurrence | Short (1–5) | Long (10+) |');
  lines.push('| Context cost | Low — applied inline | High — reads many files |');
  lines.push('| Output | Behavior modification | Discrete artifact (report, plan) |');
  lines.push('| Read-only audit work | — | Strong candidate |');
  lines.push('');
  lines.push('When the work is long, context-heavy, and dispatch-and-return, build an');
  lines.push('agent in `.ai/agents/` instead. See `.ai/agents/eval-harness.md` and');
  lines.push('`.ai/agents/skill-stocktake.md` for read-only agent templates.');
  lines.push('');

  fs.writeFileSync(INDEX_PATH, lines.join('\n'), 'utf8');

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  console.log(`\nskills/INDEX.md updated — ${totalSkills} skills across ${Object.keys(stackCounts).length} stacks\n`);

  for (const stack of STACK_ORDER) {
    const count = stackCounts[stack];
    if (count) {
      console.log(`  ${STACK_LABELS[stack].padEnd(35)} ${count} skill${count === 1 ? '' : 's'}`);
    }
  }

  if (uncategorized.length > 0) {
    console.log('');
    console.log(`  ⚠  ${uncategorized.length} uncategorized skill${uncategorized.length === 1 ? '' : 's'} (add \`stack:\` frontmatter to fix):`);
    for (const name of uncategorized) {
      console.log(`     - ${name}`);
    }
  }

  console.log('');
}

run();
