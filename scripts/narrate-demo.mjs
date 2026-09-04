#!/usr/bin/env node
/**
 * A placeholder narration track, so the cut is watchable before the real
 * voiceover exists.
 *
 * This is a machine voice from the operating system's own speech synthesiser.
 * It is not the shipped read, and the file it writes says so in its name. The
 * point is that the timing is already solved: each line is rendered on its own
 * and dropped at the exact second its subtitle cue starts, so when a real
 * recording arrives it can be dropped onto the same grid.
 *
 * Usage: node scripts/narrate-demo.mjs [--in <dir>] [--voice "Microsoft Zira Desktop"] [--rate -1]
 */
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const IN = flag('in', 'work/recording');
const VOICE = flag('voice', 'Microsoft Zira Desktop');
const RATE = flag('rate', '-1');
const CLIPS = path.join(IN, 'narration');

/** "00:00:05,320" -> 5.32 */
function toSeconds(stamp) {
  const [hms, ms] = stamp.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
}

function parseSrt(text) {
  return text.trim().split(/\r?\n\r?\n/).map((block) => {
    const lines = block.split(/\r?\n/);
    const [start, end] = lines[1].split(' --> ');
    return { start: toSeconds(start), end: toSeconds(end), text: lines.slice(2).join(' ') };
  });
}

function ffprobeSeconds(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
}

async function main() {
  const srt = parseSrt(await readFile(path.join(IN, 'cherry-demo.srt'), 'utf8'));
  await rm(CLIPS, { recursive: true, force: true });
  await mkdir(CLIPS, { recursive: true });

  // One WAV per line. Rendering them separately is what lets each one land on
  // its own cue instead of drifting a little further out with every sentence.
  const script = srt.map((cue, i) => ({ file: path.join(CLIPS, `line-${String(i + 1).padStart(2, '0')}.wav`), text: cue.text, start: cue.start, window: cue.end - cue.start }));
  /** Renders the given lines at one speaking rate, in a single synthesiser session. */
  function speak(lines, rate) {
    if (!lines.length) return;
    const ps = [
      'Add-Type -AssemblyName System.Speech',
      '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      `$synth.SelectVoice(${JSON.stringify(VOICE)})`,
      `$synth.Rate = ${rate}`,
      ...lines.map((line) => `$synth.SetOutputToWaveFile(${JSON.stringify(path.resolve(line.file))}); $synth.Speak(${JSON.stringify(line.text)})`),
      '$synth.SetOutputToNull(); $synth.Dispose()',
    ].join('; ');
    execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  }

  // A synthesiser pauses at every full stop, so a line of short sentences costs
  // more than its word count suggests. Rather than rewrite copy that is already
  // pinned to the subtitles, the lines that do not fit are re-read faster, and
  // only those lines.
  const TOLERANCE = 0.2;
  let rate = Number(RATE);
  let pending = script;
  const rates = new Map();
  while (pending.length && rate <= Number(RATE) + 3) {
    speak(pending, rate);
    pending.forEach((line) => { line.seconds = ffprobeSeconds(line.file); rates.set(line, rate); });
    pending = pending.filter((line) => line.seconds > line.window + TOLERANCE);
    rate += 1;
  }
  const overruns = pending.map((line) => ({ text: line.text, spoken: +line.seconds.toFixed(2), window: +line.window.toFixed(2), rate: rates.get(line) }));

  // Delay each clip to its own cue, then sum them. normalize=0 keeps every line
  // at the level it was rendered instead of ducking them all as inputs are added.
  const inputs = script.flatMap((line) => ['-i', line.file]);
  const delays = script.map((line, i) => `[${i + 1}:a]adelay=${Math.round(line.start * 1000)}|${Math.round(line.start * 1000)}[d${i}]`).join(';');
  const mix = `${script.map((_, i) => `[d${i}]`).join('')}amix=inputs=${script.length}:normalize=0:dropout_transition=0[a]`;
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', path.join(IN, 'cherry-demo-subtitled.mp4'),
    ...inputs,
    '-filter_complex', `${delays};${mix}`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
    path.join(IN, 'cherry-demo-narrated-placeholder.mp4'),
  ], { encoding: 'utf8' });

  console.log(JSON.stringify({
    voice: VOICE,
    baseRate: Number(RATE),
    ratesUsed: [...new Set([...rates.values()])].sort((a, b) => a - b),
    lines: script.length,
    spokenSeconds: +script.reduce((n, l) => n + l.seconds, 0).toFixed(1),
    overruns,
    output: path.join(IN, 'cherry-demo-narrated-placeholder.mp4'),
  }, null, 2));
  if (overruns.length) console.error(`\n${overruns.length} line(s) run past their cue window at this rate. Lower --rate or shorten the line.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
