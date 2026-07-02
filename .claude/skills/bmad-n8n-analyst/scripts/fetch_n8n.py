#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
import argparse
import json
import os
import sys
import urllib.error
import urllib.request


class FetchError(Exception):
    pass


def http_get(url: str, api_key: str, verbose: bool = False) -> dict:
    req = urllib.request.Request(url, headers={"X-N8N-API-KEY": api_key, "Accept": "application/json"})
    if verbose:
        print(f"GET {url}", file=sys.stderr)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        if e.code == 401:
            raise FetchError(
                "n8n rejected the API key (401). Create one in n8n -> Settings -> n8n API -> "
                "Create an API key, then set N8N_API_KEY."
            ) from e
        if e.code == 404:
            raise FetchError(f"n8n returned 404 for {url} — check the ID and that the key's owner can see it.") from e
        raise FetchError(f"n8n API returned {e.code} for {url}: {body[:500]}") from e
    except urllib.error.URLError as e:
        base = url.split("/api/")[0]
        raise FetchError(f"Could not reach n8n at {base} ({e.reason}). Check --base-url/N8N_BASE_URL and that n8n is running.") from e


def compact(value, max_chars: int, depth: int = 0, max_depth: int = 6):
    if isinstance(value, str):
        if len(value) > max_chars:
            return value[:max_chars] + f"...<{len(value) - max_chars} more chars>"
        return value
    if isinstance(value, dict):
        if depth >= max_depth:
            return f"<object with {len(value)} keys, truncated at depth {max_depth}>"
        return {k: compact(v, max_chars, depth + 1, max_depth) for k, v in value.items()}
    if isinstance(value, list):
        if depth >= max_depth:
            return f"<array of {len(value)} items, truncated at depth {max_depth}>"
        return [compact(v, max_chars, depth + 1, max_depth) for v in value]
    return value


def find_sub_execution_ref(entry: dict):
    # n8n has moved this field around across versions (metadata.subExecution vs.
    # a direct key on the run-data entry) — check the known spots defensively
    # rather than trusting one path.
    metadata = entry.get("metadata") or {}
    for candidate in (metadata.get("subExecution"), entry.get("subExecution")):
        if isinstance(candidate, dict) and candidate.get("executionId"):
            return candidate
    return None


def build_node_records(nodes, run_data, preview_items_n, preview_chars, depth, max_depth, base_url, api_key, visited, warnings, verbose):
    records = []
    for node in nodes:
        name = node.get("name")
        entries = run_data.get(name, [])
        runs = []
        for i, entry in enumerate(entries):
            main = entry.get("data", {}).get("main", []) or []
            item_count = 0
            items_preview = []
            for branch in main:
                if not branch:
                    continue
                item_count += len(branch)
                for item in branch[:preview_items_n]:
                    items_preview.append(compact(item.get("json", {}), preview_chars))

            run_record = {
                "runIndex": i,
                "startTime": entry.get("startTime"),
                "executionTimeMs": entry.get("executionTime"),
                "status": entry.get("executionStatus"),
                "itemCount": item_count,
                "outputPreview": items_preview,
                "error": compact(entry.get("error"), preview_chars) if entry.get("error") else None,
                "source": entry.get("source"),
            }

            sub_ref = find_sub_execution_ref(entry)
            if sub_ref:
                child_id = sub_ref.get("executionId")
                if child_id in visited:
                    warnings.append(f"Sub-execution {child_id} for node '{name}' already visited elsewhere — skipped to avoid a cycle.")
                elif depth >= max_depth:
                    run_record["subExecutionId"] = child_id
                    warnings.append(f"Sub-execution {child_id} for node '{name}' not expanded (max depth {max_depth} reached).")
                else:
                    visited.add(child_id)
                    try:
                        run_record["subExecution"] = fetch_execution(
                            base_url, api_key, child_id, depth + 1, max_depth, preview_items_n, preview_chars, visited, warnings, verbose
                        )
                    except FetchError as e:
                        warnings.append(f"Failed to fetch sub-execution {child_id} for node '{name}': {e}")

            runs.append(run_record)

        records.append(
            {
                "name": name,
                "type": node.get("type"),
                "disabled": node.get("disabled", False),
                "notes": node.get("notes"),
                "continueOnFail": node.get("continueOnFail"),
                "onError": node.get("onError"),
                "retryOnFail": node.get("retryOnFail"),
                "parameters": compact(node.get("parameters", {}), preview_chars),
                "runs": runs,
            }
        )

    if not run_data:
        warnings.append("No per-node run data found for this execution (may be a very old execution, or data pruning removed it).")

    return records


def fetch_execution(base_url, api_key, exec_id, depth, max_depth, preview_items_n, preview_chars, visited, warnings, verbose):
    data = http_get(f"{base_url}/api/v1/executions/{exec_id}?includeData=true", api_key, verbose)
    workflow_data = data.get("workflowData", {}) or {}
    result_data = (data.get("data") or {}).get("resultData", {}) or {}
    run_data = result_data.get("runData", {}) or {}

    top_level_error = result_data.get("error")
    status = data.get("status")
    if not status:
        status = "error" if top_level_error else ("success" if data.get("finished") else "unknown")

    return {
        "executionId": data.get("id", exec_id),
        "workflowId": data.get("workflowId"),
        "workflowName": workflow_data.get("name"),
        "mode": data.get("mode"),
        "status": status,
        "startedAt": data.get("startedAt"),
        "stoppedAt": data.get("stoppedAt"),
        "lastNodeExecuted": result_data.get("lastNodeExecuted"),
        "topLevelError": compact(top_level_error, preview_chars) if top_level_error else None,
        "workflowSettings": workflow_data.get("settings", {}),
        "nodes": build_node_records(
            workflow_data.get("nodes", []), run_data, preview_items_n, preview_chars, depth, max_depth, base_url, api_key, visited, warnings, verbose
        ),
    }


def fetch_workflow(base_url, api_key, wf_id, preview_chars, verbose):
    data = http_get(f"{base_url}/api/v1/workflows/{wf_id}", api_key, verbose)
    nodes = [
        {
            "name": node.get("name"),
            "type": node.get("type"),
            "disabled": node.get("disabled", False),
            "notes": node.get("notes"),
            "continueOnFail": node.get("continueOnFail"),
            "onError": node.get("onError"),
            "retryOnFail": node.get("retryOnFail"),
            "webhookId": node.get("webhookId"),
            "parameters": compact(node.get("parameters", {}), preview_chars),
        }
        for node in data.get("nodes", [])
    ]
    return {
        "workflowId": data.get("id", wf_id),
        "name": data.get("name"),
        "active": data.get("active"),
        "tags": [t.get("name") for t in (data.get("tags") or []) if isinstance(t, dict)],
        "settings": data.get("settings", {}),
        "connections": data.get("connections", {}),
        "updatedAt": data.get("updatedAt"),
        "nodes": nodes,
    }


def resolve_credentials(args) -> tuple[str, str]:
    base_url = (args.base_url or os.environ.get("N8N_BASE_URL") or "http://localhost:5678").rstrip("/")
    api_key = args.api_key or os.environ.get("N8N_API_KEY")
    if not api_key:
        raise FetchError(
            "No n8n API key found. Set N8N_API_KEY (or pass --api-key). Create one in n8n -> "
            "Settings -> n8n API -> Create an API key."
        )
    return base_url, api_key


def write_output(result: dict, output_path: str | None):
    text = json.dumps(result, indent=2)
    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch and flatten n8n execution or workflow data for the n8n Analyst skill. "
        "Requires a reachable n8n instance and an API key (X-N8N-API-KEY)."
    )
    parser.add_argument("--base-url", help="n8n base URL (default: $N8N_BASE_URL or http://localhost:5678)")
    parser.add_argument("--api-key", help="n8n API key (default: $N8N_API_KEY)")
    parser.add_argument("-o", "--output", help="Write JSON to this file instead of stdout")
    parser.add_argument("--verbose", action="store_true", help="Print request URLs and diagnostics to stderr")
    subparsers = parser.add_subparsers(dest="mode", required=True)

    exec_parser = subparsers.add_parser("execution", help="Fetch one execution and its sub-execution tree")
    exec_parser.add_argument("id", help="Execution ID")
    exec_parser.add_argument("--max-depth", type=int, default=5, help="Max sub-execution recursion depth (default: 5)")
    exec_parser.add_argument("--preview-items", type=int, default=3, help="Max items previewed per node run (default: 3)")
    exec_parser.add_argument("--preview-chars", type=int, default=500, help="Max chars per previewed string field (default: 500)")

    wf_parser = subparsers.add_parser("workflow", help="Fetch a workflow definition (no run data)")
    wf_parser.add_argument("id", help="Workflow ID")
    wf_parser.add_argument("--preview-chars", type=int, default=500, help="Max chars per previewed string field (default: 500)")

    args = parser.parse_args()

    try:
        base_url, api_key = resolve_credentials(args)
        if args.mode == "execution":
            visited = {args.id}
            warnings: list[str] = []
            result = fetch_execution(base_url, api_key, args.id, 0, args.max_depth, args.preview_items, args.preview_chars, visited, warnings, args.verbose)
            result["warnings"] = warnings
        else:
            result = fetch_workflow(base_url, api_key, args.id, args.preview_chars, args.verbose)
            result["warnings"] = []
        write_output(result, args.output)
    except FetchError as e:
        print(str(e), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
