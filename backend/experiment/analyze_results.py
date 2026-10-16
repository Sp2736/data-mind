"""Analyze experiment results (T18).

Usage:
    python -m experiment.analyze_results
    python -m experiment.analyze_results --logs-dir /custom/path/to/logs
"""
import argparse
import json
import statistics
from pathlib import Path

def _load_jsonl(path: Path) -> list[dict]:
    res = []
    if not path.exists():
        return res
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                try:
                    res.append(json.loads(line))
                except Exception:
                    pass
    return res

def main():
    parser = argparse.ArgumentParser(description="Analyze judged experiment results.")
    parser.add_argument(
        "--logs-dir",
        default=None,
        help="Path to logs dir. Defaults to settings.logs_dir from .env.",
    )
    args = parser.parse_args()

    if args.logs_dir:
        logs_dir = Path(args.logs_dir)
    else:
        from app.config import settings
        logs_dir = Path(settings.logs_dir)

    batches = _load_jsonl(logs_dir / "rq_batches_judged.jsonl")
    trials = _load_jsonl(logs_dir / "trials_judged.jsonl")

    arms = ["baseline", "rag"]
    
    # 1. RQ metrics
    print("=== RQ Generation Metrics ===")
    out_lines = ["# Experiment Results\n", "## RQ Generation Metrics\n"]
    out_lines.append("| Metric | Baseline | RAG |")
    out_lines.append("|---|---|---|")
    
    rq_metrics = {}
    for arm in arms:
        arm_batches = [b for b in batches if b.get("arm") == arm and "judge" in b and "error" not in b["judge"]]
        if not arm_batches:
            rq_metrics[arm] = {}
            continue
            
        cg = [b["judge"]["auto"]["column_grounding_rate"] for b in arm_batches]
        div = [b["judge"]["auto"]["diversity_score"] for b in arm_batches]
        
        rel = []
        spec = []
        act = []
        for b in arm_batches:
            for s in b["judge"].get("rq_scores", []):
                rel.append(s["relevance"])
                spec.append(s["specificity"])
                act.append(s["actionability"])
                
        rq_metrics[arm] = {
            "Grounding": statistics.mean(cg) if cg else 0,
            "Diversity": statistics.mean(div) if div else 0,
            "Relevance": statistics.mean(rel) if rel else 0,
            "Specificity": statistics.mean(spec) if spec else 0,
            "Actionability": statistics.mean(act) if act else 0,
        }
    
    for metric in ["Grounding", "Diversity", "Relevance", "Specificity", "Actionability"]:
        b_val = rq_metrics["baseline"].get(metric, 0)
        r_val = rq_metrics["rag"].get(metric, 0)
        line = f"| {metric} | {b_val:.2f} | {r_val:.2f} |"
        print(line)
        out_lines.append(line)
        
    print("\n=== Trial Execution Metrics ===")
    out_lines.append("\n## Trial Execution Metrics\n")
    out_lines.append("| Metric | Baseline | RAG |")
    out_lines.append("|---|---|---|")
    
    trial_metrics = {}
    for arm in arms:
        arm_trials = [t for t in trials if t.get("experiment_arm") == arm]
        if not arm_trials:
            trial_metrics[arm] = {}
            continue
            
        succ = [1 if t.get("status") == "succeeded" else 0 for t in arm_trials]
        
        corr = []
        faith = []
        ig = []
        for t in arm_trials:
            js = t.get("judge_scores", {})
            if "code_quality" in js:
                corr.append(js["code_quality"].get("correctness", 0))
            if "insight_automatic" in js:
                faith.append(js["insight_automatic"].get("faithfulness_rate_with_profile", 0))
            if "insight" in js and "error_insight" not in js["insight"]:
                ig.append(js["insight"].get("groundedness_rate", 0))
                
        trial_metrics[arm] = {
            "Success Rate": statistics.mean(succ) if succ else 0,
            "Code Correctness": statistics.mean(corr) if corr else 0,
            "Insight Faithfulness": statistics.mean(faith) if faith else 0,
            "Insight Groundedness": statistics.mean(ig) if ig else 0,
        }
        
    for metric in ["Success Rate", "Code Correctness", "Insight Faithfulness", "Insight Groundedness"]:
        b_val = trial_metrics["baseline"].get(metric, 0)
        r_val = trial_metrics["rag"].get(metric, 0)
        line = f"| {metric} | {b_val:.2f} | {r_val:.2f} |"
        print(line)
        out_lines.append(line)
        
    res_path = logs_dir / "results.md"
    with open(res_path, "w", encoding="utf-8") as f:
        f.write("\n".join(out_lines))
    print(f"\nResults written to {res_path}")

if __name__ == "__main__":
    main()
