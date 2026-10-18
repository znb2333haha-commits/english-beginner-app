import argparse
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/build_audio.py'
spec = importlib.util.spec_from_file_location('build_audio', SCRIPT)
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildAudioTests(unittest.TestCase):
    def test_level_range_and_filename_validation(self):
        rows = [{'word': 'apple', 'level': 1}, {'word': 'cat', 'level': 2}, {'word': 'dog', 'level': 3}]
        self.assertEqual(build.select_words(rows, 2, 3), rows[1:])
        for start, end in [(0, 1), (2, 1), (1, 7)]:
            with self.assertRaises(ValueError):
                build.select_words(rows, start, end)
        for bad in [[{'word': '../secret', 'level': 1}], [rows[0], rows[0]], []]:
            with self.assertRaises(ValueError):
                build.select_words(bad, 1, 1)

    def test_resume_corruption_repair_and_voice_guard(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            words = root / 'words.json'
            words.write_text('[{"word":"apple","level":1},{"word":"cat","level":2}]')
            args = argparse.Namespace(words=words, output=root / 'audio', manifest=root / 'manifest.json',
                                      level_start=1, level_end=1, concurrency=1)
            calls = []
            class FakeCommunicate:
                def __init__(self, word, voice, **kwargs):
                    calls.append((word, voice, kwargs['rate']))
                async def save(self, path):
                    Path(path).write_bytes(b'valid fixture')
            def inspect(path):
                if path.read_bytes() != b'valid fixture':
                    raise ValueError('corrupt')
                return {'bytes': path.stat().st_size, 'duration_seconds': 1.0,
                        'sample_rate': 24000, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            with patch.dict('sys.modules', {'edge_tts': types.SimpleNamespace(Communicate=FakeCommunicate)}), \
                 patch('importlib.metadata.version', return_value='test'), patch.object(build, 'inspect_audio', inspect):
                self.assertEqual(asyncio.run(build.build(args)), 0)
                original = (args.output / 'apple.mp3').stat().st_mtime_ns
                self.assertEqual(asyncio.run(build.build(args)), 0)
                self.assertEqual(len(calls), 1)
                self.assertEqual((args.output / 'apple.mp3').stat().st_mtime_ns, original)
                self.assertFalse((args.output / 'cat.mp3').exists())
                (args.output / 'apple.mp3').write_bytes(b'broken')
                self.assertEqual(asyncio.run(build.build(args)), 0)
                self.assertEqual(len(calls), 2)
                self.assertFalse(list(args.output.glob('*.part')))
                manifest = json.loads(args.manifest.read_text())
                manifest['voice'] = 'different-voice'
                args.manifest.write_text(json.dumps(manifest))
                with self.assertRaises(ValueError):
                    asyncio.run(build.build(args))
                self.assertEqual(len(calls), 2)


if __name__ == '__main__':
    unittest.main()
