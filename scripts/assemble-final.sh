#!/usr/bin/env bash
# Builds the submitted film from the three captures, in order.
set -euo pipefail
S="${1:?scratchpad root}"
cd "$(dirname "$0")/.."
node scripts/cinema-demo.mjs --in "$S/intro"   --source "$S/intro/cherry-intro.webm"     --captions docs/release/demo/captions-intro.json   --out "$S/intro/intro-cinema.mp4"
node scripts/cinema-demo.mjs --in "$S/journey" --source "$S/journey/cherry-journey.webm" --captions docs/release/demo/captions-journey.json --out "$S/journey/journey-cinema.mp4"
printf "file '%s'\nfile '%s'\nfile '%s'\n" "$S/intro/intro-cinema.mp4" "$S/journey/journey-cinema.mp4" "$S/recording/tour-tail.mp4" > "$S/final/list.txt"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$S/final/list.txt" -c copy "$S/final/cherry-demo-final.mp4"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$S/final/cherry-demo-final.mp4"
