#!/usr/bin/env node
/**
 * Print one line per failing browser journey: file, line, and the first two
 * lines of the real error. Reads the committed Playwright JSON report so it
 * costs nothing to run while a suite is in flight.
 */
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'docs/release/e2e-results.json';
const report = JSON.parse(readFileSync(path, 'utf8'));
const ansi = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

const failures = [];
const walk = (suite) => {
  (suite.suites ?? []).forEach(walk);
  for (const spec of suite.specs ?? []) {
    if (spec.ok) continue;
    const raw = spec.tests?.[0]?.results?.[0]?.error?.message ?? '';
    const message = raw.replace(ansi, '').split('\n').filter(Boolean).slice(0, 2).join(' | ');
    failures.push({
      where: `${(spec.file ?? '').replace('cherry/', '')}:${spec.line}`,
      title: spec.title.slice(0, 60),
      message: message.slice(0, 160),
    });
  }
};
(report.suites ?? []).forEach(walk);

const stats = report.stats ?? {};
console.log(`expected ${stats.expected} · unexpected ${stats.unexpected} · skipped ${stats.skipped} · flaky ${stats.flaky}`);
console.log(`${failures.length} failing`);
failures.forEach((f, i) => {
  console.log(`\n${i + 1}. ${f.where}  ${f.title}`);
  console.log(`   ${f.message}`);
});
