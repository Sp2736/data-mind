#!/usr/bin/env python3
"""Bulk-seeds DataMind with test datasets by POSTing each URL in
kaggle_github_datasets.json to the running backend's `/datasets` endpoint —
this is the same URL-submission flow the frontend uses, just scripted so
you don't click through 130+ datasets by hand.

Usage:
    python seed_datasets.py --list kaggle_github_datasets.json \
        --base-url http://localhost:8000 \
        --email you@local --password changeme_local \
        [--limit 20] [--domain finance,healthcare] [--sleep 2]

Prerequisites:
- The backend must be running (`uvicorn app.main:app`) with Kaggle
  credentials configured (~/.kaggle/kaggle.json) for the Kaggle entries to
  actually resolve — see DATABASE_AND_DATASETS.md.
- Each dataset is downloaded and profiled server-side in the background;
  this script only confirms the submission was accepted (HTTP 201), it does
  NOT wait for status='ready'. Poll `GET /datasets/{id}` yourself, or use
  `--wait` to have this script poll for you.
"""
import argparse
import json
import sys
import time

import requests


def login(base_url: str, email: str, password: str) -> str:
    resp = requests.post(f"{base_url}/auth/login", json={"email": email, "password": password})
    resp.raise_for_status()
    return resp.json()["access_token"]


def submit_url(base_url: str, token: str, url: str) -> dict:
    resp = requests.post(
        f"{base_url}/datasets",
        json={"url": url},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    return {"ok": resp.ok, "status_code": resp.status_code, "body": _safe_json(resp)}


def poll_until_ready(base_url: str, token: str, dataset_id: str, timeout_s: int = 300) -> str:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = requests.get(
            f"{base_url}/datasets/{dataset_id}", headers={"Authorization": f"Bearer {token}"}
        )
        if resp.ok:
            status = resp.json().get("status")
            if status in ("ready", "failed"):
                return status
        time.sleep(5)
    return "timeout"


def _safe_json(resp: requests.Response):
    try:
        return resp.json()
    except ValueError:
        return resp.text[:300]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", default="kaggle_github_datasets.json")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--limit", type=int, default=None, help="Only submit the first N entries")
    parser.add_argument("--domain", default=None, help="Comma-separated domain filter, e.g. finance,healthcare")
    parser.add_argument("--sleep", type=float, default=2.0, help="Seconds between submissions (be nice to Kaggle's API)")
    parser.add_argument("--wait", action="store_true", help="Poll each dataset until ready/failed before moving on")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be submitted, don't call the API")
    args = parser.parse_args()

    with open(args.list, encoding="utf-8") as f:
        entries = json.load(f)

    if args.domain:
        wanted = {d.strip() for d in args.domain.split(",")}
        entries = [e for e in entries if e["domain"] in wanted]
    if args.limit:
        entries = entries[: args.limit]

    if not entries:
        print("No entries matched your filters.", file=sys.stderr)
        return 1

    print(f"Submitting {len(entries)} dataset(s) to {args.base_url} ...")

    if args.dry_run:
        for e in entries:
            print(f"[dry-run] {e['domain']:<20} {e['name']:<45} {e['url']}")
        return 0

    token = login(args.base_url, args.email, args.password)

    results = {"submitted": 0, "failed": 0, "ready": 0}
    for e in entries:
        print(f"-> {e['name']} ({e['url']})", end=" ... ")
        result = submit_url(args.base_url, token, e["url"])
        if not result["ok"]:
            print(f"FAILED ({result['status_code']}): {result['body']}")
            results["failed"] += 1
            time.sleep(args.sleep)
            continue

        results["submitted"] += 1
        dataset_id = result["body"]["id"]
        print(f"accepted (id={dataset_id})", end="")

        if args.wait:
            status = poll_until_ready(args.base_url, token, dataset_id)
            print(f" -> {status}")
            if status == "ready":
                results["ready"] += 1
        else:
            print()

        time.sleep(args.sleep)

    print("\n--- Summary ---")
    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
