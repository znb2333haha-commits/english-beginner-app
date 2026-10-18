import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bpa', ROOT / 'scripts/build_phrase_audio.py')
bpa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bpa)


class PhraseAudioTests(unittest.TestCase):
    def test_load_real_phrases(self):
        items = bpa.load_phrases()
        self.assertGreaterEqual(len(items), 96)

    def test_missing_skips_existing(self):
        items = bpa.load_phrases()[:3]
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            (out / f"{items[0]['id']}.mp3").write_bytes(b'x' * 2000)
            (out / f"{items[1]['id']}.mp3").write_bytes(b'x')  # 太小,视为损坏
            todo = [p['id'] for p in bpa.missing(items, out)]
            self.assertEqual(todo, [items[1]['id'], items[2]['id']])


if __name__ == '__main__':
    unittest.main()
