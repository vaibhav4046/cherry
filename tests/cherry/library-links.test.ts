import { describe, expect, it } from 'vitest';
import { buildConnectUrl, buildRoutineDraftUrl } from '../../src/cherry/library/library-links.ts';

describe('library workflow links', () => {
  it('builds a deterministic encoded routine draft URL with both binding ids', () => {
    expect(buildRoutineDraftUrl('ws:alpha/one ?', 'sg/β &?')).toBe(
      '/studio/routines?workspaceId=ws%3Aalpha%2Fone+%3F&skillGraphId=sg%2F%CE%B2+%26%3F',
    );
  });

  it('prefers the ChatGPT host card when WebMCP is a declared target', () => {
    expect(buildConnectUrl(['agent-skills', 'claude-code', 'codex', 'webmcp'])).toBe('/connect#host-chatgpt');
  });

  it('maps Codex and Agent Skills targets to their current host cards', () => {
    expect(buildConnectUrl(['agent-skills', 'claude-code', 'codex'])).toBe('/connect#host-codex');
    expect(buildConnectUrl(['agent-skills', 'claude-code'])).toBe('/connect#host-agent-skills');
    expect(buildConnectUrl(['agent-skills'])).toBe('/connect#host-agent-skills');
  });

  it('uses the honest general Connect section for unsupported or absent targets', () => {
    expect(buildConnectUrl(['prompt-pack'])).toBe('/connect#library-tools-heading');
    expect(buildConnectUrl([])).toBe('/connect#library-tools-heading');
    expect(buildConnectUrl(['unknown-host'])).toBe('/connect#library-tools-heading');
  });
});
