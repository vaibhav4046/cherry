#!/usr/bin/env node
/**
 * Turns the raw capture into the submitted video.
 *
 * The narration below is the single source for both the burned subtitles and
 * the voiceover script, so the two cannot drift apart. Each line is checked
 * against the real measured duration of the beat it sits on: if a line cannot
 * be read inside its beat at a natural pace, this fails loudly rather than
 * shipping a subtitle that runs past its picture.
 *
 * Usage: node scripts/assemble-demo.mjs [--in <dir with capture.json>] [--wpm 150]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const IN = flag('in', 'work/recording');
const WPM = Number(flag('wpm', '150'));
const WORDS_PER_SECOND = WPM / 60;

/**
 * One line per beat, in capture order. Written to be said out loud: short
 * clauses, no clause that depends on a word the viewer cannot see on screen.
 */
const NARRATION = [
  'Cherry turns a lesson into work an agent can actually run — under human supervision.',
  'This is the deployed product. One task, and an entire team of agents behind it.',
  'Two tasks. Two separate work areas. Thirty-four seconds running in parallel. Two checks passed.',
  'You give it a goal. It plans, runs the work on your own computer, and checks the result.',
  'Here is the receipt. Two agents ran one job — and neither of them could publish it.',
  'This is a recorded run, verified before it was ever put on the page.',
  'Every step is on the record: what ran, where it ran, and what it produced.',
  'And the publish step stops here, because a person had not approved it yet.',
  'Now the WebMCP part. Cherry hands a visiting agent its tools, straight from the page.',
  'The aperture is state-aware. Seven tools are always on; the rest appear only when the state earns them.',
  'One row per registered closure — the real tools, not a description of them.',
  'And a live call log, so you can see exactly what the agent asked for.',
  'This was also driven by a real host: ChatGPT desktop, in Work mode.',
  'It fetched the aperture and called the tools. That row says Validated because it happened.',
  'What is shipped says shipped. What is not, says so too.',
  'Every claim on this site is checkable — and the one thing an agent cannot do is approve its own work.',
];

/** SRT wants HH:MM:SS,mmm. */
function stamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
}

/** Two lines maximum, broken near the middle on a word boundary. */
function wrap(line) {
  if (line.length <= 46) return line;
  const words = line.split(' ');
  let head = '';
  let i = 0;
  while (i < words.length && (head + words[i]).length < line.length / 2) head += `${words[i++]} `;
  return `${head.trim()}\n${words.slice(i).join(' ')}`;
}

function ffmpeg(cwd, argv) {
  return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { cwd, encoding: 'utf8' });
}

async function main() {
  const capture = JSON.parse(await readFile(path.join(IN, 'capture.json'), 'utf8'));
  const beats = capture.beats;
  if (beats.length !== NARRATION.length) {
    throw new Error(`capture has ${beats.length} beats but there are ${NARRATION.length} narration lines`);
  }

  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'cherry-capture.webm'], { cwd: IN, encoding: 'utf8' });
  const videoSeconds = Number(probe.trim());

  const cues = [];
  const overruns = [];
  beats.forEach((b, index) => {
    const text = NARRATION[index];
    const needed = text.split(/\s+/).length / WORDS_PER_SECOND;
    const available = b.end - b.start;
    if (needed > available) overruns.push({ index, label: b.label, needed: +needed.toFixed(1), available: +available.toFixed(1), text });
    // A cue holds its whole beat: the reader gets the full window, and the
    // subtitle never sits under a shot it does not describe.
    cues.push({ start: b.start, end: Math.min(b.end, videoSeconds), text });
  });

  const srt = cues
    .map((cue, i) => `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${wrap(cue.text)}\n`)
    .join('\n');
  await writeFile(path.join(IN, 'cherry-demo.srt'), srt, 'utf8');

  // Clean master first: H.264 so it plays everywhere a judge might open it.
  ffmpeg(IN, ['-i', 'cherry-capture.webm', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', 'cherry-demo.mp4']);
  // Then a burned-in copy, for platforms that drop the sidecar track.
  ffmpeg(IN, [
    '-i', 'cherry-demo.mp4',
    '-vf', "subtitles=cherry-demo.srt:force_style='FontName=Segoe UI,FontSize=17,PrimaryColour=&H00F2F6FD,OutlineColour=&H99000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=34'",
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    'cherry-demo-subtitled.mp4',
  ]);

  const words = NARRATION.join(' ').split(/\s+/).length;
  console.log(JSON.stringify({
    videoSeconds: +videoSeconds.toFixed(2),
    cues: cues.length,
    narrationWords: words,
    narrationSecondsAtWpm: +(words / WORDS_PER_SECOND).toFixed(1),
    wpm: WPM,
    overruns,
    outputs: [path.join(IN, 'cherry-demo.mp4'), path.join(IN, 'cherry-demo-subtitled.mp4'), path.join(IN, 'cherry-demo.srt')],
  }, null, 2));
  if (overruns.length) {
    console.error(`\n${overruns.length} narration line(s) do not fit their beat. Shorten the line or lengthen the beat.`);
    process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
