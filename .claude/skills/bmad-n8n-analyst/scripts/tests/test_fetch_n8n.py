#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fetch_n8n import build_node_records, compact, find_sub_execution_ref  # noqa: E402


class TestCompact(unittest.TestCase):
    def test_short_string_untouched(self):
        self.assertEqual(compact("hello", 10), "hello")

    def test_long_string_truncated_with_marker(self):
        result = compact("x" * 20, 5)
        self.assertTrue(result.startswith("xxxxx..."))
        self.assertIn("15 more chars", result)

    def test_nested_dict_and_list(self):
        value = {"a": ["y" * 20], "b": {"c": "z" * 20}}
        result = compact(value, 5)
        self.assertTrue(result["a"][0].startswith("yyyyy..."))
        self.assertTrue(result["b"]["c"].startswith("zzzzz..."))

    def test_depth_limit(self):
        value = {"a": {"b": {"c": {"d": "too deep"}}}}
        result = compact(value, 100, max_depth=2)
        self.assertIn("truncated at depth", result["a"]["b"])


class TestFindSubExecutionRef(unittest.TestCase):
    def test_metadata_path(self):
        entry = {"metadata": {"subExecution": {"executionId": "42", "workflowId": "7"}}}
        self.assertEqual(find_sub_execution_ref(entry)["executionId"], "42")

    def test_direct_path(self):
        entry = {"subExecution": {"executionId": "99"}}
        self.assertEqual(find_sub_execution_ref(entry)["executionId"], "99")

    def test_missing(self):
        self.assertIsNone(find_sub_execution_ref({}))


class TestBuildNodeRecords(unittest.TestCase):
    def test_flattens_run_data_and_counts_items(self):
        nodes = [{"name": "HTTP Request", "type": "n8n-nodes-base.httpRequest", "parameters": {"url": "https://example.com"}}]
        run_data = {
            "HTTP Request": [
                {
                    "startTime": 1000,
                    "executionTime": 250,
                    "executionStatus": "success",
                    "data": {"main": [[{"json": {"id": 1}}, {"json": {"id": 2}}]]},
                }
            ]
        }
        warnings = []
        records = build_node_records(nodes, run_data, 3, 500, 0, 5, "http://x", "key", set(), warnings, False)
        self.assertEqual(len(records), 1)
        run = records[0]["runs"][0]
        self.assertEqual(run["itemCount"], 2)
        self.assertEqual(run["status"], "success")
        self.assertEqual(len(warnings), 0)

    def test_warns_when_no_run_data(self):
        nodes = [{"name": "Set", "type": "n8n-nodes-base.set", "parameters": {}}]
        warnings = []
        build_node_records(nodes, {}, 3, 500, 0, 5, "http://x", "key", set(), warnings, False)
        self.assertTrue(any("No per-node run data" in w for w in warnings))


if __name__ == "__main__":
    unittest.main()
