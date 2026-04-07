#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'skills');
const OUTPUT_ROOT = path.join(ROOT, '.agents', 'skills');
const isDryRun = process.argv.includes('--dry-run');

const SKILLS = [
  {
    name: 'tdd-workflow',
    displayName: 'TDD Workflow',
    shortDescription: 'Test-driven development with 80%+ coverage',
    brandColor: '#22C55E',
    defaultPrompt: 'Follow TDD: write tests first, implement, verify 80%+ coverage',
  },
  {
    name: 'security-review',
    displayName: 'Security Review',
    shortDescription: 'Security review checklist for app and API changes',
    brandColor: '#EF4444',
    defaultPrompt: 'Review this change for security issues, risky assumptions, and missing safeguards',
  },
  {
    name: 'coding-standards',
    displayName: 'Coding Standards',
    shortDescription: 'Comprehensible code standards and project conventions',
    brandColor: '#3B82F6',
    defaultPrompt: 'Apply the project coding standards and keep the change comprehensible',
  },
  {
    name: 'backend-patterns',
    displayName: 'Backend Patterns',
    shortDescription: 'API, service, and data-layer implementation patterns',
    brandColor: '#14B8A6',
    defaultPrompt: 'Apply backend patterns for API boundaries, services, repositories, and validation',
  },
  {
    name: 'frontend-patterns',
    displayName: 'Frontend Patterns',
    shortDescription: 'Frontend architecture, state, and component patterns',
    brandColor: '#8B5CF6',
    defaultPrompt: 'Apply frontend patterns for components, state, and data flow',
  },
  {
    name: 'e2e-testing',
    displayName: 'E2E Testing',
    shortDescription: 'End-to-end test planning and Playwright guidance',
    brandColor: '#F59E0B',
    defaultPrompt: 'Plan or implement E2E coverage for the critical user journey',
  },
  {
    name: 'eval-harness',
    displayName: 'Eval Harness',
    shortDescription: 'Eval-driven development and scoring loops',
    brandColor: '#06B6D4',
    defaultPrompt: 'Define or tighten an eval harness for this behavior before broad rollout',
  },
  {
    name: 'strategic-compact',
    displayName: 'Strategic Compact',
    shortDescription: 'Context management and compact timing guidance',
    brandColor: '#6366F1',
    defaultPrompt: 'Help manage context deliberately and preserve only the important state',
  },
  {
    name: 'api-design',
    displayName: 'API Design',
    shortDescription: 'REST API design patterns and interface decisions',
    brandColor: '#F97316',
    defaultPrompt: 'Design or review this API surface for clarity, contracts, and error behavior',
  },
  {
    name: 'verification-loop',
    displayName: 'Verification Loop',
    shortDescription: 'Build, test, lint, typecheck, and verify changes',
    brandColor: '#10B981',
    defaultPrompt: 'Run the verification loop: build, test, lint, typecheck, and review the results',
  },
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  if (isDryRun) {
    console.log(`[dry-run] ${filePath}`);
    return;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function buildOpenAiYaml(skill) {
  return [
    'interface:',
    `  display_name: "${skill.displayName}"`,
    `  short_description: "${skill.shortDescription}"`,
    `  brand_color: "${skill.brandColor}"`,
    `  default_prompt: "${skill.defaultPrompt}"`,
    'policy:',
    '  allow_implicit_invocation: true',
    '',
  ].join('\n');
}

function main() {
  if (!isDryRun && fs.existsSync(OUTPUT_ROOT)) {
    fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  }

  ensureDir(OUTPUT_ROOT);

  for (const skill of SKILLS) {
    const sourceSkill = path.join(SOURCE_ROOT, skill.name, 'SKILL.md');
    if (!fs.existsSync(sourceSkill)) {
      throw new Error(`Missing source skill: ${sourceSkill}`);
    }

    const outputDir = path.join(OUTPUT_ROOT, skill.name);
    const outputSkill = path.join(outputDir, 'SKILL.md');
    const outputMeta = path.join(outputDir, 'agents', 'openai.yaml');
    const skillContent = fs.readFileSync(sourceSkill, 'utf8');

    writeFile(outputSkill, skillContent);
    writeFile(outputMeta, buildOpenAiYaml(skill));
  }

  console.log(`Exported ${SKILLS.length} Codex skills to ${OUTPUT_ROOT}`);
}

main();
