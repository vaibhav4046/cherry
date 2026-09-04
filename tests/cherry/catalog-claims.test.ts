import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOL_STATE_TABLE, GLOBAL_TOOLS, buildToolDefinitions, type ToolContext } from '../../src/cherry/webmcp/tool-definitions.ts';
import { markdownToLessonText } from '../../src/cherry/library/catalog-install.ts';

/**
 * Regressions for two defects a hostile pass found: both were tools describing
 * themselves inaccurately, which is the same defect class as returning a wrong
 * answer — an agent acts on the description.
 */
describe('catalog tool claims', () => {
  const sourceFor = (relative: string) => readFileSync(resolve(__dirname, '../../src', relative), 'utf8');

  it('never points an agent at a tool that does not exist', () => {
    const definitions = buildToolDefinitions({
      getActiveWorkspaceId: () => null,
      getActiveMissionId: () => null,
    } as unknown as ToolContext);
    const real = new Set([...definitions.map((definition) => definition.name), ...GLOBAL_TOOLS]);

    // Any snake_case identifier a message tells the caller to use must resolve.
    const texts = [
      sourceFor('cherry/library/catalog-install.ts'),
      sourceFor('cherry/webmcp/tool-definitions.ts'),
    ].join('\n');

    const referenced = new Set<string>();
    for (const match of texts.matchAll(/\b(?:Call|call|Use|use)\s+([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)) {
      referenced.add(match[1]!);
    }
    expect(referenced.size).toBeGreaterThan(0);

    const ghosts = [...referenced].filter((name) => !real.has(name));
    expect(ghosts, `guidance names tools that do not exist: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('only offers install_catalog_skill from a state that actually registers it', () => {
    const offering = Object.entries(TOOL_STATE_TABLE)
      .filter(([, tools]) => tools.includes('install_catalog_skill'))
      .map(([state]) => state);
    expect(offering).toContain('empty');
    // If this ever becomes global the aperture claim breaks.
    expect(GLOBAL_TOOLS as readonly string[]).not.toContain('install_catalog_skill');
  });

  it('builds the catalog note from the list that shipped, not the list before trimming', () => {
    const source = sourceFor('cherry/webmcp/tool-definitions.ts');
    // The count in the note must come from the payload, after appendIfBounded.
    expect(source).toContain('const shippedCatalog =');
    expect(source).toMatch(/catalogSkills lists \$\{shippedCatalog\}/);
  });
});

describe('markdownToLessonText', () => {
  it('drops fenced code rather than feeding it to the deriver', () => {
    const out = markdownToLessonText('Parse the email headers carefully.\n```bash\nrm -rf /\n```\nVerify the SPF record now.');
    expect(out).not.toContain('rm -rf');
    expect(out).toContain('Parse the email headers carefully.');
    expect(out).toContain('Verify the SPF record now.');
  });

  it('unwraps list and heading markers so imperatives start the sentence', () => {
    const out = markdownToLessonText('## Investigation steps\n- Parse the Received headers in order.\n1. Check the DKIM signature next.');
    for (const line of out.split('\n\n')) {
      expect(line).not.toMatch(/^[-*+#\d]/);
    }
    expect(out).toContain('Parse the Received headers in order.');
    expect(out).toContain('Check the DKIM signature next.');
  });

  it('separates blocks with a blank line, because plain transcripts split on those', () => {
    // Joined with single newlines the whole document arrived as one segment.
    const out = markdownToLessonText('- Open the message source now.\n- Copy the Received chain here.');
    expect(out.split('\n\n')).toHaveLength(2);
  });

  it('removes HTML comments, which would otherwise make the text sniff as SRT', () => {
    const out = markdownToLessonText('<!-- internal note -->\nOpen the message source now.');
    expect(out).not.toContain('-->');
    expect(out).toContain('Open the message source now.');
  });

  it('drops YAML front matter instead of deriving steps from metadata', () => {
    const out = markdownToLessonText('---\nname: a-skill\ndescription: Parse and analyze email headers thoroughly.\n---\nOpen the raw message source.');
    expect(out).not.toContain('description:');
    expect(out).not.toContain('name:');
    expect(out).toContain('Open the raw message source.');
  });

  it('keeps link text and strips emphasis without rewriting the sentence', () => {
    const out = markdownToLessonText('Review the [SPF specification](https://example.com/spf) **carefully** before acting.');
    expect(out).toBe('Review the SPF specification carefully before acting.');
  });

  it('terminates every line so consecutive lines do not merge into one run-on', () => {
    const out = markdownToLessonText('- Open the message source\n- Copy the Received chain');
    expect(out.split('\n\n').every((line) => /[.!?:]$/.test(line))).toBe(true);
  });

  it('extracts many more usable lines from a real structured document', () => {
    const markdown = [
      '# Analyzing email headers',
      '',
      'Use this when investigating a suspected phishing message.',
      '',
      '## Steps',
      '- Open the raw message source in your mail client.',
      '- Parse the Received headers from bottom to top.',
      '- Verify the SPF result against the sending domain.',
      '- Check the DKIM signature for alignment.',
      '',
      '```bash',
      'dig +short TXT example.com',
      '```',
      '',
      '> Always record the original message id.',
      '',
      'The report should name every hop that failed authentication.',
    ].join('\n');

    const lines = markdownToLessonText(markdown).split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(7);
    expect(lines.some((line) => line.startsWith('Parse the Received headers'))).toBe(true);
    expect(lines.some((line) => line.startsWith('Always record'))).toBe(true);
    expect(lines.every((line) => !line.includes('dig +short'))).toBe(true);
  });
});
