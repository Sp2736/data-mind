FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    MPLBACKEND=Agg \
    MPLCONFIGDIR=/tmp/mpl

# Install data science packages the LLM-generated code will need.
# Keep this in sync with what the code_generator system prompt says
# is available (see agents/prompts/code_generator_system_prompt.md).
# Versions pinned to match backend/requirements.txt for dtype/behaviour parity.
COPY requirements.txt /tmp/sandbox_requirements.txt
RUN pip install --no-cache-dir -r /tmp/sandbox_requirements.txt

WORKDIR /workspace
# No ENTRYPOINT — the backend passes the script path at `docker run` time:
#   docker run --rm --network none                              \
#              -v /path/to/script.py:/workspace/script.py:ro   \
#              -v /path/to/data.csv:/workspace/data.csv:ro     \
#              -v /path/to/output:/workspace/output:rw         \
#              datamind-sandbox:latest python /workspace/script.py
