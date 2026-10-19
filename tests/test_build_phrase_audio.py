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
        self.assertGreaterEqual(len(items), 240)

    def test_dialog_lines_included(self):
        ids = {p['id'] for p in bpa.load_phrases()}
        self.assertIn('greet-d1', ids)

    def test_kids_items_unique_and_safe(self):
        items = bpa.load_kids()
        self.assertGreaterEqual(len(items), 60)
        self.assertEqual(len({i['id'] for i in items}), len(items))

    def test_examples_one_per_word(self):
        items = bpa.load_examples()
        self.assertGreaterEqual(len(items), 500)
        self.assertEqual(len({i['id'] for i in items}), len(items))

    def test_lookup_words_cover_phrase_tokens(self):
        ids = {i['id'] for i in bpa.load_lookup_words()}
        self.assertIn('slowly', ids)
        self.assertIn('go', ids)  # went/going 等词形对应原词
        self.assertTrue(all(i.isalpha() for i in ids))

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
