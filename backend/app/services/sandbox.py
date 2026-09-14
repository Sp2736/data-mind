"""Sandbox executor for running LLM-generated pandas scripts.

Two execution modes are available, controlled by the USE_DOCKER_SANDBOX env var:

MODE 1 — Subprocess (USE_DOCKER_SANDBOX=false, the default)
    Runs the generated script as a subprocess of the backend, in a fresh scratch
    directory, under the same OS user.  A network-block wrapper is prepended and
    POSIX resource limits (RLIMIT_AS / RLIMIT_CPU) are applied on Linux/Mac;
    on Windows only the wall-clock timeout enforces limits.  Fast, zero overhead,
    appropriate for local single-user development.

MODE 2 — Docker (USE_DOCKER_SANDBOX=true)
    Runs the generated script inside `datamind-sandbox:latest` via `docker run`:
      --rm              container is destroyed after each attempt (never reused)
      --network none    no outbound or inbound network from the container
      --memory          capped by SANDBOX_MEMORY_LIMIT (default 1g)
      --cpus            capped by SANDBOX_CPU_LIMIT (default 1)
    The dataset is bind-mounted read-only at /workspace/data.<ext>.
    The output directory is bind-mounted read-write at /workspace/output/.
    Use this mode when running experiments for reproducibility / the paper —
    it gives real OS-level network + filesystem isolation.

The function signature `run_in_sandbox(code_text, dataset_path, run_id, attempt)`
is identical in both modes; no calling code needs to change when switching.
Build the image once with:
    docker build -t datamind-sandbox:latest backend/sandbox/
"""
from __future__ import annotations

import subprocess
import sys
import textwrap
import time
from pathlib import Path

from app.config import settings

# ---------------------------------------------------------------------------
# Subprocess mode — prefixes prepended to the generated script
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _prepare_workdir(run_id: str, attempt: int, dataset_path: Path) -> tuple[Path, Path, Path]:
    """Create the per-attempt scratch directory and copy the dataset in.

    Returns (workdir, output_dir, local_data_path).
    The dataset is always copied (not symlinked) so it's safe for Docker
    bind-mounts on Windows where symlinks to host paths are unreliable.
    Paths are resolved to absolute to avoid doubled-path bugs when subprocess
    is launched with cwd=workdir.
    """
    workdir = (Path(settings.generated_code_dir) / run_id / f"attempt_{attempt}").resolve()
    workdir.mkdir(parents=True, exist_ok=True)
    output_dir = workdir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    local_data_path = workdir / f"data{dataset_path.suffix}"
    if not local_data_path.exists():
        local_data_path.write_bytes(dataset_path.read_bytes())

    return workdir, output_dir, local_data_path


def _collect_result(
    workdir: Path,
    output_dir: Path,
    returncode: int,
    stdout: str,
    stderr: str,
    duration_ms: int,
) -> dict:
    output_files = [
        str(p.relative_to(workdir)) for p in output_dir.glob("**/*") if p.is_file()
    ]
    return {
        "exit_code": returncode,
        "stdout": stdout,
        "stderr": stderr,
        "duration_ms": duration_ms,
        "succeeded": returncode == 0,
        "output_files": output_files,
        "workdir": str(workdir),
    }


# ---------------------------------------------------------------------------
# Mode 1: Subprocess executor
# ---------------------------------------------------------------------------

def _run_subprocess(
    code_text: str,
    workdir: Path,
    output_dir: Path,
    script_path: Path,
) -> dict:
    mem_bytes = _parse_mem_limit(settings.sandbox_memory_limit)
    prefix = (
        _RESOURCE_LIMIT_PREFIX.format(
            mem_bytes=mem_bytes,
            cpu_seconds=settings.sandbox_timeout_seconds,
        )
        + _NETWORK_BLOCK_PREFIX
    )
    script_path.write_text(prefix + "\n\n" + code_text, encoding="utf-8")

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
        return _collect_result(
            workdir, output_dir,
            result.returncode, result.stdout, result.stderr, duration_ms,
        )
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


# ---------------------------------------------------------------------------
# Mode 2: Docker executor
# ---------------------------------------------------------------------------

def _run_docker(
    code_text: str,
    workdir: Path,
    output_dir: Path,
    local_data_path: Path,
    script_path: Path,
) -> dict:
    # Write the raw script — no host-side prefix needed; isolation is enforced
    # by the container (--network none, memory/CPU limits on `docker run`).
    script_path.write_text(code_text, encoding="utf-8")

    # Convert paths to POSIX strings for Docker CLI on Windows.
    def _win_path(p: Path) -> str:
        """c:\\foo\\bar → /c/foo/bar for Docker Desktop on Windows."""
        s = str(p.resolve())
        if len(s) > 1 and s[1] == ":":
            return "/" + s[0].lower() + s[2:].replace("\\", "/")
        return s.replace("\\", "/")

    cmd = [
        "docker", "run", "--rm",
        "--network", "none",
        f"--memory={settings.sandbox_memory_limit}",
        f"--cpus={settings.sandbox_cpu_limit}",
        # dataset — read-only, at the path the LLM prompts advertise
        "-v", f"{_win_path(script_path)}:/workspace/script.py:ro",
        "-v", f"{_win_path(local_data_path)}:/workspace/data{local_data_path.suffix}:ro",
        # output dir — writable, so the script can save charts/cleaned CSVs
        "-v", f"{_win_path(output_dir)}:/workspace/output:rw",
        settings.sandbox_image,
        "python", "/workspace/script.py",
    ]

    started = time.monotonic()
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.sandbox_timeout_seconds + 10,  # +10s for docker run overhead
        )
        duration_ms = int((time.monotonic() - started) * 1000)
        return _collect_result(
            workdir, output_dir,
            result.returncode, result.stdout, result.stderr, duration_ms,
        )
    except subprocess.TimeoutExpired as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        return {
            "exit_code": -1,
            "stdout": exc.stdout or "",
            "stderr": f"Docker execution timed out after {settings.sandbox_timeout_seconds}s",
            "duration_ms": duration_ms,
            "succeeded": False,
            "output_files": [],
            "workdir": str(workdir),
        }
    except FileNotFoundError:
        # `docker` binary not on PATH
        return {
            "exit_code": -2,
            "stdout": "",
            "stderr": (
                "Docker not found on PATH. Either install Docker Desktop "
                "or set USE_DOCKER_SANDBOX=false to use subprocess mode."
            ),
            "duration_ms": 0,
            "succeeded": False,
            "output_files": [],
            "workdir": str(workdir),
        }


# ---------------------------------------------------------------------------
# Public API — same signature regardless of mode
# ---------------------------------------------------------------------------

def run_in_sandbox(
    code_text: str,
    dataset_path: Path,
    run_id: str,
    attempt: int,
) -> dict:
    """Run `code_text` against `dataset_path` in an isolated environment.

    The script sees the dataset at ./data.<ext> (subprocess) or
    /workspace/data.<ext> (Docker) and should write outputs to ./output/.
    The working-directory contract is the same either way because the LLM
    prompts use relative paths that resolve identically in both modes.

    Returns a dict with keys:
        exit_code (int), stdout (str), stderr (str), duration_ms (int),
        succeeded (bool), output_files (list[str]), workdir (str)
    """
    # Resolve to absolute path so reads work regardless of CWD
    dataset_path = dataset_path.resolve()
    workdir, output_dir, local_data_path = _prepare_workdir(run_id, attempt, dataset_path)
    script_path = workdir / f"attempt_{attempt}.py"

    if settings.use_docker_sandbox:
        return _run_docker(code_text, workdir, output_dir, local_data_path, script_path)
    else:
        return _run_subprocess(code_text, workdir, output_dir, script_path)
