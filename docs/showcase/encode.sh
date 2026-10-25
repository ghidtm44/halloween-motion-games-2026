#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
frames="$repo_root/apps/simple-playground-v1/work/showcase"
output="$repo_root/docs/media"
palette_dir="$(mktemp -d "${TMPDIR:-/tmp}/playground-showcase.XXXXXX")"
trap 'rm -f "$palette_dir/motion.png" "$palette_dir/host.png"; rmdir "$palette_dir"' EXIT
command -v ffmpeg >/dev/null
test -f "$frames/motion-0000.png"
test -f "$frames/host-0000.png"
mkdir -p "$output"
ffmpeg -hide_banner -loglevel error -y -framerate 12 -i "$frames/motion-%04d.png" \
  -vf 'fps=10,scale=640:-1:flags=lanczos,palettegen=max_colors=192' -frames:v 1 "$palette_dir/motion.png"
ffmpeg -hide_banner -loglevel error -y -framerate 12 -i "$frames/motion-%04d.png" -i "$palette_dir/motion.png" \
  -lavfi '[0:v]fps=10,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle' \
  -loop 0 "$output/motion-games.gif"
ffmpeg -hide_banner -loglevel error -y -framerate 12 -i "$frames/host-%04d.png" \
  -vf 'scale=720:-1:flags=lanczos,palettegen=max_colors=192' -frames:v 1 "$palette_dir/host.png"
ffmpeg -hide_banner -loglevel error -y -framerate 12 -i "$frames/host-%04d.png" -i "$palette_dir/host.png" \
  -lavfi '[0:v]scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle' \
  -loop 0 "$output/spooky-host.gif"
