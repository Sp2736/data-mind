FROM python:3.12-slim

# Install data science packages the LLM-generated code will need.
# Keep this in sync with what the code_generator system prompt says
# is available (see agents/prompts/code_generator_system_prompt.md).
RUN pip install --no-cache-dir \
    pandas==2.2.3 \
    numpy==2.0.2 \
    matplotlib==3.9.4 \
    scipy==1.14.1 \
    seaborn==0.13.2

WORKDIR /workspace
# No ENTRYPOINT — the backend passes the script path at `docker run` time:
#   docker run --rm --network none -v script.py:/workspace/script.py:ro \
#              -v dataset:/workspace/data.csv:ro \
#              -v output_dir:/workspace/output:rw \
#              datamind-sandbox:latest python /workspace/script.py
