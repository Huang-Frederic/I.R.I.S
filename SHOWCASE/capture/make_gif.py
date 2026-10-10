#!/usr/bin/env python3
"""Turn a screen recording into a showcase GIF: exactly 960x540, palette-optimized,
under a size budget.

    make_gif.py INPUT OUTPUT [--cut START:DURATION ...] [--crop W:H:X:Y]
                [--speed 1.0] [--fps 12] [--max-mb 4] [--pad black]

--cut can be given several times: the cuts are taken from the same recording in
order and joined into one GIF (a montage). Without --cut, the whole video is used.
--crop is in source pixels and applies to every cut. When the cropped area is not
16:9 the picture is fitted and padded with --pad.

If the GIF is over --max-mb, the script retries with fewer frames per second, then
fewer colors, and fails (exit 1) if nothing fits. Needs ffmpeg and ffprobe on PATH.
Standard library only.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

WIDTH, HEIGHT = 960, 540


def parse_cut(text):
    try:
        start, duration = (float(v) for v in text.split(':'))
    except ValueError:
        raise argparse.ArgumentTypeError(f'--cut expects START:DURATION in seconds, got {text!r}')
    if start < 0 or duration <= 0:
        raise argparse.ArgumentTypeError(f'--cut needs a start >= 0 and a duration > 0, got {text!r}')
    return start, duration


def parse_crop(text):
    parts = text.split(':')
    if len(parts) != 4 or not all(p.isdigit() for p in parts):
        raise argparse.ArgumentTypeError(f'--crop expects W:H:X:Y in pixels, got {text!r}')
    return tuple(int(p) for p in parts)


def build_filter(cuts, crop, speed, fps, colors, pad):
    chains = []
    if cuts:
        labels = []
        for i, (start, duration) in enumerate(cuts):
            chains.append(f'[0:v]trim=start={start}:duration={duration},setpts=PTS-STARTPTS[c{i}]')
            labels.append(f'[c{i}]')
        chains.append(f'{"".join(labels)}concat=n={len(cuts)}:v=1:a=0[cat]')
        source = '[cat]'
    else:
        source = '[0:v]'
    steps = [f'setpts=PTS/{speed}']
    if crop:
        w, h, x, y = crop
        steps.append(f'crop={w}:{h}:{x}:{y}')
    steps += [
        f'scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos',
        f'pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color={pad}',
        f'fps={fps}',
        'split[a][b]',
    ]
    chains.append(f'{source}{",".join(steps)}')
    chains.append(f'[a]palettegen=max_colors={colors}:stats_mode=diff[p]')
    chains.append('[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle')
    return ';'.join(chains)


def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0',
         '-show_entries', 'stream=width,height,nb_read_frames', '-show_entries', 'format=duration',
         '-of', 'json', path],
        check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    stream = data['streams'][0]
    return int(stream['width']), int(stream['height']), int(stream.get('nb_read_frames', 0)), float(data['format'].get('duration', 0))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--cut', action='append', type=parse_cut, default=[], help='START:DURATION in seconds (repeatable)')
    parser.add_argument('--crop', type=parse_crop, help='W:H:X:Y in source pixels')
    parser.add_argument('--speed', type=float, default=1.0, help='playback speed (1.5 = 50%% faster)')
    parser.add_argument('--fps', type=int, default=12)
    parser.add_argument('--max-mb', type=float, default=4.0)
    parser.add_argument('--pad', default='black', help='color of the bars when the crop is not 16:9')
    args = parser.parse_args()

    for tool in ('ffmpeg', 'ffprobe'):
        if not shutil.which(tool):
            sys.exit(f'{tool} is not installed (needed to make GIFs).')
    if not os.path.exists(args.input):
        sys.exit(f'No such file: {args.input}')
    if args.speed <= 0:
        sys.exit('--speed must be positive')

    attempts = []
    for fps, colors in [(args.fps, 256), (min(args.fps, 10), 256), (8, 256), (8, 128), (6, 128), (6, 64)]:
        if (fps, colors) not in attempts and fps <= args.fps:
            attempts.append((fps, colors))

    budget = args.max_mb * 1024 * 1024
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        candidate = os.path.join(tmp, 'out.gif')
        for fps, colors in attempts:
            graph = build_filter(args.cut, args.crop, args.speed, fps, colors, args.pad)
            subprocess.run(
                ['ffmpeg', '-v', 'error', '-y', '-i', args.input, '-filter_complex', graph, '-loop', '0', candidate],
                check=True,
            )
            size = os.path.getsize(candidate)
            print(f'  {fps} fps, {colors} colors: {size / 1024 / 1024:.2f} MB')
            if size <= budget:
                shutil.move(candidate, args.output)
                width, height, frames, duration = probe(args.output)
                print(f'{args.output}: {width}x{height}, {frames} frames, {duration:.1f} s, {size / 1024 / 1024:.2f} MB')
                if duration > 12:
                    print('note: longer than 12 s; consider shorter cuts or --speed')
                return
    sys.exit(f'Could not fit {args.output} under {args.max_mb} MB: use shorter cuts, a tighter crop or --speed.')


if __name__ == '__main__':
    main()
