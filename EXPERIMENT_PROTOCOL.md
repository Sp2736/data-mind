# DataMind Experiment Protocol

This document details how to run the end-to-end RAG-vs-baseline experiments for the DataMind research paper.

## 1. Setup & Seed Datasets

First, ensure your environment is running, then populate the system with the evaluation datasets:

```bash
cd backend
python seed_datasets.py
```
This script downloads datasets from Kaggle/GitHub, runs the profile extraction, and waits until they are marked as `ready`.

## 2. Execute Trials

Run the experiment harness to generate questions and run the analysis pipeline across all specified datasets. 

```bash
python -m experiment.run_experiment \
    --dataset-ids <uuid1> <uuid2> <uuid3> \
    --n-reps 5 \
    --max-attempts 3 \
    --max-rqs 8 \
    --sleep 2 \
    --resume
```

**Parameters:**
- `--n-reps 5`: Generates 5 batches of RQs per dataset per arm.
- `--max-rqs 8`: Limits analysis to the first 8 RQs per batch to cap execution costs.
- `--resume`: Skips batches already present in `../data/logs/rq_batches.jsonl`.

## 3. Offline LLM Judging

Once trials are complete, use the held-out judge model to score them. This script is idempotent.

```bash
python -m experiment.judge_trials \
    --concurrency 5 \
    --allow-same-model
```

The output will be saved to `../data/logs/rq_batches_judged.jsonl` and `../data/logs/trials_judged.jsonl`.

## 4. Aggregate & Analyze Results

Finally, run the analysis script to compute the summary statistics for the paper (RQ grounding rate, success rate, token usage, judge scores).

```bash
python -m experiment.analyze_results
```
This produces final tables and outputs to `../data/logs/results.md`.
