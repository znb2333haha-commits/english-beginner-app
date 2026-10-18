#!/usr/bin/env python3
"""T2 第一步：仅固定的 10 词+2 句试听，不读取词库、不生成正式内置音频。

无需付费密钥。请在仓库外的独立虚拟环境安装试听依赖，见 docs/tts-samples/README.md。
模型和 Piper 程序由 --models/--piper 指定，不下载到仓库。失败记录在各候选 manifest.json。
"""
import argparse
import asyncio
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = [(word, word) for word in
           'apple water go think three ship sheep about teacher beautiful'.split()] + [
    ('sentence-1', 'I eat an apple and drink water.'),
    ('sentence-2', 'The teacher sees three sheep near the ship.'),
]


def audio_info(path):
    import numpy as np
    import soundfile as sf
    samples, rate = sf.read(path, always_2d=True)
    peak = float(np.max(np.abs(samples)))
    if not (0.15 < len(samples) / rate < 30) or peak < 0.001 or not np.isfinite(samples).all():
        raise ValueError(f'无效音频: {path.name}')
    return {'file': path.name, 'bytes': path.stat().st_size,
            'duration_seconds': round(len(samples) / rate, 3), 'sample_rate': rate,
            'channels': samples.shape[1], 'peak': round(peak, 6),
            'clipped_samples': int(np.sum(np.abs(samples) >= 0.9999)),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


async def edge_samples(voice, directory):
    import edge_tts
    for name, text in SAMPLES:
        # 默认语速，与离线候选各自默认速度比较；单次超时防止卡住整个试听任务。
        await asyncio.wait_for(edge_tts.Communicate(text, voice, rate='+0%',
                                                   connect_timeout=15, receive_timeout=30)
                               .save(str(directory / f'{name}.mp3')), timeout=45)


def generate(args):
    import soundfile as sf
    voices = {'kokoro': ['af_heart', 'am_adam'],
              'edge': ['en-US-JennyNeural', 'en-US-GuyNeural'],
              'piper': ['en_US-ljspeech-medium']}[args.engine]
    load_start = time.perf_counter()
    model = None
    if args.engine == 'kokoro':
        from kokoro_onnx import Kokoro
        model = Kokoro(str(args.models / 'kokoro-v1.0.onnx'), str(args.models / 'voices-v1.0.bin'))
    load_seconds = time.perf_counter() - load_start
    for voice in voices:
        directory = ROOT / 'docs/tts-samples' / f'{args.engine}-{voice}'
        directory.mkdir(parents=True, exist_ok=True)
        report = {'engine': args.engine, 'voice': voice, 'language': 'en-US',
                  'speed': 'default', 'python': platform.python_version(),
                  'platform': platform.platform(), 'model_load_seconds': round(load_seconds, 3),
                  'samples': [], 'status': 'running'}
        start = time.perf_counter()
        try:
            if args.engine == 'kokoro':
                report['package_version'] = importlib.metadata.version('kokoro-onnx')
                for name, text in SAMPLES:
                    samples, rate = model.create(text, voice=voice, speed=1.0, lang='en-us')
                    sf.write(directory / f'{name}.wav', samples, rate, subtype='PCM_16')
            elif args.engine == 'edge':
                report['package_version'] = importlib.metadata.version('edge-tts')
                asyncio.run(edge_samples(voice, directory))
            else:
                report['runtime_version'] = 'rhasspy/piper 2023.11.14-2 (MIT legacy)'
                payload = '\n'.join(json.dumps({'text': text, 'output_file': str(directory / f'{name}.wav')})
                                    for name, text in SAMPLES) + '\n'
                subprocess.run([str(args.piper), '--model', str(args.models / f'{voice}.onnx'),
                                '--json-input'], input=payload, encoding='utf8',
                               capture_output=True, check=True, timeout=180)
            report['generation_seconds'] = round(time.perf_counter() - start, 3)
            extension = '.mp3' if args.engine == 'edge' else '.wav'
            for name, text in SAMPLES:
                report['samples'].append({'text': text, **audio_info(directory / (name + extension))})
            report['status'] = 'complete'
        except Exception as error:
            report['status'] = 'failed'
            # 避免将在线服务请求 URL（可能含服务令牌）写进版本库。
            report['error_type'] = type(error).__name__
            report['http_status'] = getattr(error, 'status', None)
            report['elapsed_seconds'] = round(time.perf_counter() - start, 3)
            # 仅移除本次固定输出中的空文件，不留下无法播放的试听链接。
            for name, _ in SAMPLES:
                path = directory / f'{name}.mp3'
                if path.exists() and path.stat().st_size == 0:
                    path.unlink()
        (directory / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(voice, report['status'], report.get('generation_seconds', report.get('error_type')), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('engine', choices=['kokoro', 'edge', 'piper'])
    parser.add_argument('--models', type=Path, required=True)
    parser.add_argument('--piper', type=Path)
    args = parser.parse_args()
    if args.engine == 'piper' and not args.piper:
        parser.error('piper 候选必须指定 --piper 可执行程序路径')
    generate(args)
