#!/usr/bin/env node
/**
 * Harness Eval Runner
 *
 * Parses fixture frontmatter and grades a session transcript against it.
 *
 * Deterministic checks only — no LLM graders.
 *
 * Usage:
 *   node evals/run-evals.js                                    # list fixtures
 *   node evals/run-evals.js --fixture <id> --transcript <path> # grade one fixture
 *   node evals/run-evals.js --all --transcript-dir <dir>       # grade all (one transcript per fixture)
 */

const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: null, body: content };
  const meta = {};
  const yaml = m[1];
  // Tiny YAML-ish parser — handles flat keys, nested objects, and string-array lists.
  const lines = yaml.split('\n');
  let currentKey = null;
  let currentObj = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^(\s*)/)[1].length;
    const line = raw.trim();
    if (indent === 0) {
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      if (v === '') {
        currentKey = k.trim();
        meta[currentKey] = {};
        currentObj = meta[currentKey];
      } else {
        meta[k.trim()] = coerce(v);
        currentKey = null;
        currentObj = null;
      }
    } else if (line.startsWith('- ')) {
      const item = coerce(line.slice(2).trim());
      if (Array.isArray(currentObj)) currentObj.push(item);
      else if (currentObj && currentObj.__pending) {
        currentObj.__pending.push(item);
      }
    } else {
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      if (v === '') {
        currentObj[k.trim()] = [];
        currentObj.__pending = currentObj[k.trim()];
      } else {
        currentObj[k.trim()] = coerce(v);
        delete currentObj.__pending;
      }
    }
  }
  // Clean up __pending markers
  for (const k of Object.keys(meta)) {
    if (meta[k] && typeof meta[k] === 'object') delete meta[k].__pending;
  }
  return { meta, body: m[2] };
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  return v.replace(/^["']|["']$/g, '');
}

function listFixtures() {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs.readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf8');
      const { meta } = parseFrontmatter(content);
      return { file: f, id: meta?.id || f.replace(/\.md$/, ''), meta, body: content };
    });
}

function parseTranscript(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) {
    throw new Error(`Transcript not found: ${transcriptPath}`);
  }
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch {}
  }
  // Flatten tool_use blocks out of assistant messages for easier matching.
  const flat = [];
  for (const e of events) {
    flat.push(e);
    if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      for (const block of e.message.content) {
        if (block.type === 'tool_use') {
          flat.push({ type: 'tool_use', name: block.name, input: block.input, ts: e.timestamp });
        }
      }
    }
  }
  return flat;
}

function grade(fixture, events) {
  const { meta } = fixture;
  const findings = [];
  const expects = meta.expects || {};

  const toolUses = events.filter(e => e.type === 'tool_use' || e.tool_name);
  const readPaths = toolUses
    .filter(t => (t.name || t.tool_name) === 'Read')
    .map(t => t.input?.file_path || t.tool_input?.file_path);
  const editPaths = toolUses
    .filter(t => ['Edit', 'Write'].includes(t.name || t.tool_name))
    .map(t => t.input?.file_path || t.tool_input?.file_path);
  const bashCmds = toolUses
    .filter(t => (t.name || t.tool_name) === 'Bash')
    .map(t => t.input?.command || t.tool_input?.command || '');

  // must_read_files_before_first_edit
  if (Array.isArray(expects.must_read_files_before_first_edit)) {
    const firstEditIdx = toolUses.findIndex(t => ['Edit', 'Write'].includes(t.name || t.tool_name));
    const beforeEdit = firstEditIdx === -1 ? toolUses : toolUses.slice(0, firstEditIdx);
    const readPathsBefore = beforeEdit
      .filter(t => (t.name || t.tool_name) === 'Read')
      .map(t => t.input?.file_path || t.tool_input?.file_path);
    for (const need of expects.must_read_files_before_first_edit) {
      const hit = readPathsBefore.some(p => p && p.endsWith(need));
      findings.push({ pass: hit, check: `read ${need} before first edit` });
    }
  }

  // must_not_edit_files
  if (Array.isArray(expects.must_not_edit_files)) {
    for (const banned of expects.must_not_edit_files) {
      const hit = editPaths.some(p => p && p.endsWith(banned));
      findings.push({ pass: !hit, check: `did not edit ${banned}` });
    }
  }

  // must_not_edit_files_in (directory check)
  if (Array.isArray(expects.must_not_edit_files_in)) {
    for (const dir of expects.must_not_edit_files_in) {
      const hit = editPaths.some(p => p && p.includes(`/${dir.replace(/\/$/, '')}/`));
      findings.push({ pass: !hit, check: `did not edit anything under ${dir}` });
    }
  }

  // must_run_command_matching
  if (expects.must_run_command_matching) {
    const re = new RegExp(expects.must_run_command_matching);
    const hit = bashCmds.some(c => re.test(c));
    findings.push({ pass: hit, check: `ran a command matching /${expects.must_run_command_matching}/` });
  }

  // must_create_branch_matching
  if (expects.must_create_branch_matching) {
    const re = new RegExp(expects.must_create_branch_matching);
    const hit = bashCmds.some(c => /git checkout -b/.test(c) && re.test(c));
    findings.push({ pass: hit, check: `created branch matching /${expects.must_create_branch_matching}/` });
  }

  // first_edit_must_be_a_test_file
  if (expects.first_edit_must_be_a_test_file) {
    const firstEdit = editPaths[0];
    const isTest = firstEdit && /(\.test\.|\.spec\.|__tests__\/)/.test(firstEdit);
    findings.push({ pass: !!isTest, check: `first edit was a test file (got ${firstEdit || 'no edit'})` });
  }

  // diff_max_lines — heuristic: count lines in Write content and Edit new_string
  if (typeof expects.diff_max_lines === 'number') {
    let total = 0;
    for (const t of toolUses) {
      const name = t.name || t.tool_name;
      if (name === 'Write') total += (t.input?.content || '').split('\n').length;
      if (name === 'Edit') {
        const ns = (t.input?.new_string || '').split('\n').length;
        const os = (t.input?.old_string || '').split('\n').length;
        total += Math.max(ns, os);
      }
    }
    findings.push({ pass: total <= expects.diff_max_lines, check: `diff ${total} <= ${expects.diff_max_lines} lines` });
  }

  // files_edited_max
  if (typeof expects.files_edited_max === 'number') {
    const unique = new Set(editPaths.filter(Boolean));
    findings.push({ pass: unique.size <= expects.files_edited_max, check: `files edited ${unique.size} <= ${expects.files_edited_max}` });
  }

  // agent_tools_must_be_exactly — check agent frontmatter on disk, not transcript
  if (Array.isArray(expects.agent_tools_must_be_exactly) && meta.expects?.must_invoke_agent) {
    const agentPath = path.join(__dirname, '..', '.claude', 'agents', `${meta.expects.must_invoke_agent}.md`);
    if (fs.existsSync(agentPath)) {
      const front = fs.readFileSync(agentPath, 'utf8').match(/^---\n([\s\S]*?)\n---/);
      const toolsLine = front?.[1].match(/^tools:\s*\[(.*)\]/m);
      const tools = toolsLine ? toolsLine[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')) : [];
      const expected = expects.agent_tools_must_be_exactly;
      const match = tools.length === expected.length && expected.every(t => tools.includes(t));
      findings.push({ pass: match, check: `agent ${meta.expects.must_invoke_agent} declares tools=[${expected.join(',')}] (got [${tools.join(',')}])` });
    } else {
      findings.push({ pass: false, check: `agent file not found: ${agentPath}` });
    }
  }

  // must_not_invoke_tools
  if (Array.isArray(expects.must_not_invoke_tools)) {
    for (const banned of expects.must_not_invoke_tools) {
      const hit = toolUses.some(t => (t.name || t.tool_name) === banned);
      findings.push({ pass: !hit, check: `did not invoke ${banned}` });
    }
  }

  // must_invoke_agent — checks for Task tool dispatch with subagent_type matching
  if (expects.must_invoke_agent) {
    const wanted = expects.must_invoke_agent;
    const taskCalls = toolUses.filter(t => (t.name || t.tool_name) === 'Task');
    const hit = taskCalls.some(t => {
      const input = t.input || t.tool_input || {};
      return input.subagent_type === wanted || (input.description || '').toLowerCase().includes(wanted.toLowerCase());
    });
    findings.push({ pass: hit, check: `invoked agent ${wanted} via Task dispatch` });
  }

  // Assistant text content — pooled for severity / mention checks below.
  const assistantText = events
    .filter(e => e.type === 'assistant' && Array.isArray(e.message?.content))
    .flatMap(e => e.message.content)
    .filter(b => b.type === 'text' || typeof b.text === 'string')
    .map(b => b.text || '')
    .join('\n');

  // must_report_finding_at_severity — assistant output must mention the severity level.
  if (expects.must_report_finding_at_severity) {
    const sev = expects.must_report_finding_at_severity.toUpperCase();
    const re = new RegExp(`\\b${sev}\\b`);
    findings.push({ pass: re.test(assistantText.toUpperCase()), check: `assistant output mentions severity ${sev}` });
  }

  // must_mention_in_findings — case-insensitive substring match against assistant output.
  if (Array.isArray(expects.must_mention_in_findings)) {
    const lower = assistantText.toLowerCase();
    for (const phrase of expects.must_mention_in_findings) {
      findings.push({ pass: lower.includes(phrase.toLowerCase()), check: `assistant output mentions "${phrase}"` });
    }
  }

  // ticket_count_min / ticket_count_max — count gh issue create + linear issues create invocations.
  if (typeof expects.ticket_count_min === 'number' || typeof expects.ticket_count_max === 'number') {
    const ticketCalls = bashCmds.filter(c =>
      /\bgh\s+issue\s+create\b/.test(c) || /\blinear\s+issues\s+create\b/.test(c)
    ).length;
    if (typeof expects.ticket_count_min === 'number') {
      findings.push({ pass: ticketCalls >= expects.ticket_count_min, check: `created >= ${expects.ticket_count_min} tickets (got ${ticketCalls})` });
    }
    if (typeof expects.ticket_count_max === 'number') {
      findings.push({ pass: ticketCalls <= expects.ticket_count_max, check: `created <= ${expects.ticket_count_max} tickets (got ${ticketCalls})` });
    }
  }

  // each_ticket_must_contain — every Write to a context.md must include all required strings.
  if (Array.isArray(expects.each_ticket_must_contain)) {
    const ticketWrites = toolUses.filter(t => {
      const name = t.name || t.tool_name;
      const fp = t.input?.file_path || t.tool_input?.file_path || '';
      return name === 'Write' && /\.ai\/tickets\/[^/]+\/context\.md$/.test(fp);
    });
    if (ticketWrites.length === 0) {
      findings.push({ pass: false, check: `expected at least one ticket context.md written` });
    } else {
      for (const phrase of expects.each_ticket_must_contain) {
        const allHave = ticketWrites.every(t => (t.input?.content || t.tool_input?.content || '').includes(phrase));
        findings.push({ pass: allHave, check: `every ticket context.md contains "${phrase}"` });
      }
    }
  }

  return findings;
}

function fmt(findings, fixture) {
  const passed = findings.filter(f => f.pass).length;
  const total = findings.length;
  const status = total === 0 ? 'SKIP' : passed === total ? 'PASS' : 'FAIL';
  const symbol = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '~';
  let out = `${symbol} ${status}  ${fixture.id}  (${passed}/${total})\n`;
  for (const f of findings) {
    out += `    ${f.pass ? '✓' : '✗'} ${f.check}\n`;
  }
  return { out, status };
}

function main() {
  const argv = process.argv.slice(2);
  const flag = k => {
    const i = argv.indexOf(`--${k}`);
    return i === -1 ? null : argv[i + 1];
  };

  const fixtures = listFixtures();

  if (argv.length === 0) {
    console.log(`Fixtures (${fixtures.length}):`);
    for (const fx of fixtures) {
      console.log(`  ${fx.id} — ${fx.meta?.description || ''}`);
    }
    console.log(`\nRun: node evals/run-evals.js --fixture <id> --transcript <path>`);
    process.exit(0);
  }

  const fixtureId = flag('fixture');
  const transcriptPath = flag('transcript');

  if (!fixtureId || !transcriptPath) {
    console.error('Usage: node evals/run-evals.js --fixture <id> --transcript <path>');
    process.exit(2);
  }

  const fixture = fixtures.find(f => f.id === fixtureId);
  if (!fixture) {
    console.error(`Fixture not found: ${fixtureId}`);
    process.exit(2);
  }

  const events = parseTranscript(transcriptPath);
  const findings = grade(fixture, events);
  const { out, status } = fmt(findings, fixture);
  process.stdout.write(out);
  process.exit(status === 'PASS' ? 0 : 1);
}

main();
