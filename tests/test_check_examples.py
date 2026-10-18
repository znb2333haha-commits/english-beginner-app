"""运行:python -m unittest discover -s tests -p 'test_*.py'"""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("check_examples", ROOT / "scripts/check_examples.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

WORDS = [
    {"id": 1, "word": "go", "forms": "p:went/d:gone/i:going/3:goes/s:goes", "level": 1},
    {"id": 2, "word": "apple", "forms": "s:apples", "level": 1},
]


class CheckExamplesTests(unittest.TestCase):
    def run_check(self, examples):
        return mod.check(WORDS, examples, only_level_one=True)

    def test_good_data_passes(self):
        errors, _ = self.run_check({
            "go": [{"en": "I went home.", "zh": "我回家了。"}],
            "apple": [{"en": "I eat apples.", "zh": "我吃苹果。"}],
        })
        self.assertEqual(errors, [])

    def test_bad_data_reports_errors(self):
        errors, _ = self.run_check({
            "go": [{"en": "I like cats very much and dogs too, but not birds.", "zh": ""}],
            "apple": [{"en": "I eat bread.", "zh": "我吃面包。"}],
            "ghost": [{"en": "boo", "zh": "嘘"}],
        })
        text = "\n".join(errors)
        self.assertIn("超过", text)
        self.assertIn("中文为空", text)
        self.assertIn("没有用到目标词", text)
        self.assertIn("不在词库里", text)

    def test_missing_level_one_word(self):
        errors, _ = self.run_check({"go": [{"en": "Go home.", "zh": "回家。"}]})
        self.assertTrue(any("apple: 缺少例句" in e for e in errors))

    def test_real_data_has_no_errors(self):
        words = json.loads((ROOT / "data/words.json").read_text(encoding="utf-8"))
        examples = json.loads((ROOT / "data/examples.json").read_text(encoding="utf-8"))
        errors, _ = mod.check(words, examples, only_level_one=True)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
