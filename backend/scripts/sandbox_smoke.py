#!/usr/bin/env python3
"""Sandbox smoke test (T08).

Verifies that all required data-science libraries are importable and that the
sandbox can execute a script that writes output/chart.png and prints a number.

Run from the repo root:
    python backend/scripts/sandbox_smoke.py
    python backend/scripts/sandbox_smoke.py --docker   # requires USE_DOCKER_SANDBOX=true

Pass: all imports succeed + chart.png found + a number printed.
Fail: any import raises, or no chart.png, or output contains no number.
"""
from __future__ import annotations

import argparse
import os
import sys
import tempfile
import re
from pathlib import Path

# Make sure we can import from the backend app package.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

SMOKE_SCRIPT = """\
import os
os.environ.setdefault("MPLBACKEND", "Agg")

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import scipy
import sklearn
import seaborn as sns

# Simple computation
data = pd.DataFrame({"x": np.arange(10), "y": np.random.randn(10)})
result = data["y"].mean()
print(f"mean={result:.4f}")

# Write a chart
fig, ax = plt.subplots()
ax.plot(data["x"], data["y"])
os.makedirs("output", exist_ok=True)
fig.savefig("output/chart.png")
plt.close(fig)
print("chart written")
"""


def run_smoke(use_docker: bool) -> bool:
    import csv, io

    # Create a tiny CSV dataset for the test
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["a", "b"])
        writer.writerow([1, 2])
        writer.writerow([3, 4])
        dataset_path = Path(f.name)

    try:
        if use_docker:
            os.environ["USE_DOCKER_SANDBOX"] = "true"
        else:
            os.environ["USE_DOCKER_SANDBOX"] = "false"

        # Re-import settings with updated env
        import importlib
        import app.config as cfg_mod
        importlib.reload(cfg_mod)
        from app.services import sandbox as sb_mod
        importlib.reload(sb_mod)

        result = sb_mod.run_in_sandbox(
            code_text=SMOKE_SCRIPT,
            dataset_path=dataset_path,
            run_id="smoke-test",
            attempt=1,
        )
    finally:
        dataset_path.unlink(missing_ok=True)

    mode = "docker" if use_docker else "subprocess"
    print(f"\n[{mode}] exit_code={result['exit_code']}")
    print(f"[{mode}] stdout: {result['stdout'][:200]}")
    if result["stderr"]:
        print(f"[{mode}] stderr: {result['stderr'][:300]}")

    if not result["succeeded"]:
        print(f"FAIL [{mode}]: script did not succeed. exit_code={result['exit_code']}")
        return False

    # Check a number was printed
    if not re.search(r"\d", result["stdout"]):
        print(f"FAIL [{mode}]: no number found in stdout")
        return False

    # Check chart.png was written
    chart_files = [f for f in result["output_files"] if f.endswith(".png")]
    if not chart_files:
        print(f"FAIL [{mode}]: no .png file in output_files: {result['output_files']}")
        return False

    print(f"PASS [{mode}]: imports OK, number printed, chart.png found ({chart_files[0]})")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="DataMind sandbox smoke test")
    parser.add_argument("--docker", action="store_true", help="Test docker mode instead of subprocess")
    args = parser.parse_args()

    ok = run_smoke(use_docker=args.docker)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
