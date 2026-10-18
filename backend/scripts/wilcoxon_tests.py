"""wilcoxon_tests.py -- Paired Wilcoxon signed-rank tests for the DataMind paper.

For each evaluation metric, computes per-dataset paired (RAG, Baseline) means,
then runs scipy.stats.wilcoxon (two-sided) to test statistical significance.

Usage:
    python scripts/wilcoxon_tests.py
    python scripts/wilcoxon_tests.py --logs-dir /custom/path/to/logs
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

try:
    from scipy.stats import wilcoxon
except ImportError:
    raise SystemExit("scipy is required: pip install scipy")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_jsonl(path: Path) -> list[dict]:
    records = []
    if not path.exists():
        return records
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except Exception:
                    pass
    return records


def _wilcoxon_safe(rag: list, baseline: list):
    if len(rag) != len(baseline):
        return "N/A", "N/A", 0, "unequal pair counts"
    diffs = [r - b for r, b in zip(rag, baseline)]
    n_diff = sum(1 for d in diffs if abs(d) > 1e-5)
    if n_diff == 0:
        return 0.0, 1.0, 0, "all differences zero"
    try:
        stat, p = wilcoxon(rag, baseline, alternative="two-sided", zero_method="wilcox")
        direction = "RAG > Base" if statistics.mean(rag) > statistics.mean(baseline) else "Base > RAG"
        return round(float(stat), 4), round(float(p), 4), n_diff, direction
    except Exception as e:
        return "N/A", "N/A", n_diff, str(e)



def _sig(p) -> str:
    if not isinstance(p, float):
        return ""
    if p < 0.001:
        return "***"
    if p < 0.01:
        return "**"
    if p < 0.05:
        return "*"
    return "ns"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Wilcoxon tests for DataMind RAG vs Baseline.")
    parser.add_argument("--logs-dir", default=None, help="Path to logs dir.")
    args = parser.parse_args()

    if args.logs_dir:
        logs_dir = Path(args.logs_dir)
    else:
        from app.config import settings
        logs_dir = Path(settings.logs_dir)

    batches = _load_jsonl(logs_dir / "rq_batches_judged.jsonl")
    trials  = _load_jsonl(logs_dir / "trials_judged.jsonl")

    pairing_file = logs_dir / "dataset_pairing.json"
    if not pairing_file.exists():
        raise SystemExit("dataset_pairing.json not found. Run prepare_judging.py first.")
    with open(pairing_file, "r", encoding="utf-8") as f:
        pairing = json.load(f)

    paired_canonical = {
        info["canonical_dataset_id"]
        for info in pairing.values()
        if info.get("rag_original_dataset_id") and info.get("baseline_original_dataset_id")
    }
    print(f"Fully paired canonical datasets: {len(paired_canonical)}\n")

    # -----------------------------------------------------------------------
    # 1. RQ-level: aggregate per (canonical_id, arm)
    # -----------------------------------------------------------------------
    rq_data = defaultdict(lambda: {
        "rag": defaultdict(list),
        "baseline": defaultdict(list),
    })

    for b in batches:
        if "judge" not in b or "error" in b.get("judge", {}):
            continue
        cid = b.get("dataset_id")
        arm = b.get("arm")
        if not cid or arm not in ("rag", "baseline"):
            continue
        auto = b["judge"].get("auto", {})
        rq_data[cid][arm]["grounding"].append(auto.get("column_grounding_rate", 0))
        rq_data[cid][arm]["diversity"].append(auto.get("diversity_score", 0))
        rq_data[cid][arm]["category_coverage"].append(auto.get("category_coverage_rate", 0))
        for s in b["judge"].get("rq_scores", []):
            rq_data[cid][arm]["relevance"].append(s.get("relevance", 0))
            rq_data[cid][arm]["specificity"].append(s.get("specificity", 0))
            rq_data[cid][arm]["actionability"].append(s.get("actionability", 0))

    def _rq_paired(metric: str):
        rv, bv = [], []
        for cid in sorted(paired_canonical):
            rl = rq_data[cid]["rag"].get(metric, [])
            bl = rq_data[cid]["baseline"].get(metric, [])
            if rl and bl:
                rv.append(statistics.mean(rl))
                bv.append(statistics.mean(bl))
        return rv, bv

    # -----------------------------------------------------------------------
    # 2. Trial-level: aggregate per (canonical_id, arm)
    # -----------------------------------------------------------------------
    trial_data = defaultdict(lambda: {
        "rag": defaultdict(list),
        "baseline": defaultdict(list),
    })

    for t in trials:
        cid = t.get("dataset_id")
        arm = t.get("experiment_arm")
        if not cid or arm not in ("rag", "baseline"):
            continue
        js = t.get("judge_scores") or {}
        trial_data[cid][arm]["success"].append(1 if t.get("status") == "succeeded" else 0)
        cq = js.get("code_quality")
        if cq and isinstance(cq, dict):
            trial_data[cid][arm]["code_correctness"].append(cq.get("correctness", 0))
            trial_data[cid][arm]["code_idiomatic"].append(cq.get("idiomatic_usage", 0))
            trial_data[cid][arm]["code_robustness"].append(cq.get("robustness", 0))
        ia = js.get("insight_automatic")
        if ia and isinstance(ia, dict):
            trial_data[cid][arm]["faithfulness"].append(ia.get("faithfulness_rate_with_profile", 0))
        ins = js.get("insight")
        if ins and isinstance(ins, dict) and "error_insight" not in ins:
            trial_data[cid][arm]["groundedness"].append(ins.get("groundedness_rate", 0))

    def _trial_paired(metric: str):
        rv, bv = [], []
        for cid in sorted(paired_canonical):
            rl = trial_data[cid]["rag"].get(metric, [])
            bl = trial_data[cid]["baseline"].get(metric, [])
            if rl and bl:
                rv.append(statistics.mean(rl))
                bv.append(statistics.mean(bl))
        return rv, bv

    # -----------------------------------------------------------------------
    # 3. Run tests, print, save
    # -----------------------------------------------------------------------
    metrics_rq = [
        ("Grounding",         "grounding"),
        ("Diversity",         "diversity"),
        ("Category Coverage", "category_coverage"),
        ("Relevance",         "relevance"),
        ("Specificity",       "specificity"),
        ("Actionability",     "actionability"),
    ]
    metrics_trial = [
        ("Success Rate",         "success"),
        ("Code Correctness",     "code_correctness"),
        ("Code Idiomatic",       "code_idiomatic"),
        ("Code Robustness",      "code_robustness"),
        ("Insight Faithfulness", "faithfulness"),
        ("Insight Groundedness", "groundedness"),
    ]

    md_lines = [
        "# Wilcoxon Signed-Rank Test Results",
        "",
        "*(Two-sided test, per-dataset paired means, `zero_method='wilcox'`)*",
        "",
    ]

    def _run_section(title: str, metrics: list, paired_fn):
        print("=" * 80)
        print(f"  {title}")
        print("=" * 80)
        print(f"{'Metric':<24}  {'Pairs':>5}  {'Diff':>4}  {'RAG':>7}  {'Base':>7}  {'W':>8}  {'p':>8}  {'Sig':<4}  Direction")
        print("-" * 80)

        md_lines.append(f"## {title}")
        md_lines.append("")
        md_lines.append("| Metric | Pairs | Pairs Differ | RAG mean | Baseline mean | W | p-value | Sig | Direction |")
        md_lines.append("|---|---|---|---|---|---|---|---|---|")

        for label, key in metrics:
            rag, base = paired_fn(key)
            n   = len(rag)
            rm  = round(statistics.mean(rag),  3) if rag  else "N/A"
            bm  = round(statistics.mean(base), 3) if base else "N/A"
            stat, p, n_diff, note = _wilcoxon_safe(rag, base)
            sig = _sig(p) if isinstance(p, float) else ""
            print(f"{label:<24}  {n:>5}  {n_diff:>4}  {str(rm):>7}  {str(bm):>7}  {str(stat):>8}  {str(p):>8}  {sig:<4}  {note}")
            md_lines.append(f"| {label} | {n} | {n_diff} | {rm} | {bm} | {stat} | {p} | {sig or 'ns'} | {note} |")

        print()
        md_lines.append("")

    _run_section("RQ GENERATION METRICS (Wilcoxon Signed-Rank Test)", metrics_rq, _rq_paired)
    _run_section("TRIAL EXECUTION METRICS (Wilcoxon Signed-Rank Test)", metrics_trial, _trial_paired)

    print("Significance: *** p<0.001  ** p<0.01  * p<0.05  ns = not significant")
    md_lines.append("> **Significance levels:** `***` p<0.001 &nbsp; `**` p<0.01 &nbsp; `*` p<0.05 &nbsp; `ns` not significant")

    out_path = logs_dir / "wilcoxon_results.md"
    out_path.write_text("\n".join(md_lines), encoding="utf-8")
    print(f"\nFull results saved to: {out_path}")


if __name__ == "__main__":
    main()
