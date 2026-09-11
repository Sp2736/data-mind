"""Local, Docker-free sandbox for running LLM-generated pandas scripts.

Trade-off vs. the original Docker-based design (kept in the plan doc for
reference): this gives host-side timeout + memory enforcement and a scratch
working directory per attempt, but it does NOT give real OS-level network
isolation or filesystem isolation — the script runs as a subprocess of the
backend, under the same OS user. For a single-user local research prototype
this is an acceptable trade-off; do not point this at untrusted input data
or run it multi-tenant. See ORCHESTRATOR_COMPLETION.md for the full
rationale and how to switch back to the Docker version if you ever need
stronger isolation.

Mitigations applied:
- A fresh, empty working directory per attempt (`cwd`), so the script has no
  access to the rest of the repo via relative paths.
- A wrapper script disables `socket` at import time to block accidental
  network calls (best-effort, not a security boundary).
- `resource.setrlimit` caps CPU time and address space on POSIX (Linux/Mac).
  On Windows this is skipped and only the wall-clock `timeout` applies.
- `subprocess.run(..., timeout=...)` is the real enforcement backstop.
- The script always runs `--rm`-equivalent: attempt directories are unique
  and never reused.
"""
from __future__ import annotations

import subprocess
import sys
import textwrap
import time
from pathlib import Path

from app.config import settings

_NETWORK_BLOCK_PREFIX = textwrap.dedent(
    """
    import socket as _socket

    def _blocked(*a, **k):
        raise OSError("Network access is disabled in this sandbox.")

    _socket.socket = _blocked
    _socket.create_connection = _blocked
    """
)

_RESOURCE_LIMIT_PREFIX = textwrap.dedent(
    """
    import sys
    if sys.platform != "win32":
        try:
            import resource
            _mem_bytes = {mem_bytes}
            resource.setrlimit(resource.RLIMIT_AS, (_mem_bytes, _mem_bytes))
            resource.setrlimit(resource.RLIMIT_CPU, ({cpu_seconds}, {cpu_seconds}))
        except Exception:
            pass
    """
)


def _parse_mem_limit(mem_limit: str) -> int:
    """Turns '1g' / '512m' style strings into a byte count."""
    mem_limit = mem_limit.strip().lower()
    if mem_limit.endswith("g"):
        return int(float(mem_limit[:-1]) * 1024**3)
    if mem_limit.endswith("m"):
        return int(float(mem_limit[:-1]) * 1024**2)
    return int(mem_limit)


def run_in_sandbox(
    code_text: str,
    dataset_path: Path,
    run_id: str,
    attempt: int,
) -> dict:
    """Runs `code_text` against `dataset_path` in an isolated working dir.

    The script sees the dataset at ./data.<ext> and should write outputs to
    ./output/ inside its own working directory — both paths are relative,
    matching the contract the LLM prompts describe (adapted from
    /workspace/... in the Docker version to a plain local path here).
    """
    workdir = Path(settings.generated_code_dir) / run_id / f"attempt_{attempt}"
    workdir.mkdir(parents=True, exist_ok=True)
    output_dir = workdir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Symlink/copy the dataset into the workdir under a fixed name so the
    # LLM's assumed path (./data.<ext>) is always correct.
    local_data_path = workdir / f"data{dataset_path.suffix}"
    if not local_data_path.exists():
        local_data_path.write_bytes(dataset_path.read_bytes())

    mem_bytes = _parse_mem_limit(settings.sandbox_memory_limit)
    prefix = (
        _RESOURCE_LIMIT_PREFIX.format(mem_bytes=mem_bytes, cpu_seconds=settings.sandbox_timeout_seconds)
        + _NETWORK_BLOCK_PREFIX
    )
    full_script = prefix + "\n\n" + code_text

    script_path = workdir / f"attempt_{attempt}.py"
    script_path.write_text(full_script, encoding="utf-8")

    started = time.monotonic()
    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=settings.sandbox_timeout_seconds,
        )
        duration_ms = int((time.monotonic() - started) * 1000)
        output_files = [str(p.relative_to(workdir)) for p in output_dir.glob("**/*") if p.is_file()]
        return {
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "duration_ms": duration_ms,
            "succeeded": result.returncode == 0,
            "output_files": output_files,
            "workdir": str(workdir),
        }
    except subprocess.TimeoutExpired as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        return {
            "exit_code": -1,
            "stdout": exc.stdout or "",
            "stderr": f"Execution timed out after {settings.sandbox_timeout_seconds}s",
            "duration_ms": duration_ms,
            "succeeded": False,
            "output_files": [],
            "workdir": str(workdir),
        }
