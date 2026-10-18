"""运行：python -m unittest discover -s tests -p 'test_*.py'"""
import importlib.util
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import json
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/build_words.py'
spec = importlib.util.spec_from_file_location('build_words', SCRIPT)
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildWordsTests(unittest.TestCase):
    def test_american_conversion(self):
        for phones, expected in [
            ('W AO1 T ER0', 'ˈwɔtɚ'), ('AH0 B AW1 T', 'əˈbaʊt'),
            ('W ER1 K', 'wɝk'), ('G OW1', 'goʊ'),
            ('K AH0 M P Y UW1 T ER0', 'kəmˈpjutɚ'),
            ('IH0 K S P L EY1 N', 'ɪkˈspleɪn'),
            ('AE2 B S EH1 N T', 'ˌæbˈsɛnt'),
        ]:
            self.assertEqual(build.arpabet_to_ipa(phones.split()), expected)
        with self.assertRaises(ValueError):
            build.arpabet_to_ipa(['UNKNOWN'])

    def test_fallback_normalization(self):
        self.assertEqual(build.clean_phonetic("'hɒt"), 'ˈhɑt')
        self.assertEqual(build.clean_phonetic('ɡəʊ'), 'goʊ')
        self.assertEqual(build.clean_phonetic('bɜːd'), 'bɝd')
        self.assertEqual(build.clean_phonetic('ә:'), 'ɝ')

    def test_sqlite_pipeline_and_dictionary_variants(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            db = root / 'stardict.db'
            with sqlite3.connect(db) as con:
                con.execute('CREATE TABLE stardict (word, phonetic, translation, pos, collins, oxford, tag, bnc, frq, exchange)')
                con.executemany('INSERT INTO stardict VALUES (?,?,?,?,?,?,?,?,?,?)', [
                    ('the', 'ðə', 'art. 那', 'a:100', 5, 1, '', 1, 1, ''),
                    ('go', '', 'v. 去', 'v:100', 5, 1, '', 2, 2, ''),
                    ('hot', 'hɒt', 'a. 热', 'j:100', 5, 1, '', 3, 3, ''),
                ])
            con.close()
            cmu = root / 'cmu.dict'
            cmu.write_text(';;; comment\ngo G OW1\ngo(2) G AH1\nthe DH AH0 # comment\n', encoding='utf-8')
            output = root / 'words.json'
            result = subprocess.run([sys.executable, '-X', 'utf8', str(SCRIPT), str(db), str(output), '3', '--cmudict', str(cmu)], capture_output=True, text=True, encoding='utf-8', check=True)
            words = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual([w['word'] for w in words], ['go', 'hot', 'the'])
            self.assertEqual([w['phonetic'] for w in words], ['goʊ', 'hɑt', 'ðə'])
            self.assertEqual([w['id'] for w in words], [1, 2, 3])
            self.assertIn('回退 1 词: hot', result.stdout)

    def test_pos_and_auxiliary_order(self):
        rows = [dict(word=w, pos=p, meaning=m, freq_rank=i) for i, (w, p, m) in enumerate([
            ('the', 'a', 'art.'), ('be', 'v', 'v.'), ('can', 'v', 'aux.'),
            ('go', 'v', 'v.'), ('happy', 'j', 'a.'), ('now', 'r', 'adv.'), ('you', 'p', 'pron.')])]
        self.assertEqual([r['word'] for r in sorted(rows, key=build.learning_key)], ['go', 'happy', 'now', 'you', 'the', 'be', 'can'])


if __name__ == '__main__':
    unittest.main()
