# SSOT — LlamaPanel (LLM Server Manager)

**Version:** 2.0 (Deep Architecture)
**Date:** 2026-10-21

> Single source of truth. Describes not only the structure, but also business logic, algorithms, and the rationale for architectural decisions.

## 1. Project Philosophy
**LlamaPanel** was created as a replacement for heavyweight orchestrators (Kubernetes, Docker Compose) for local PCs/servers. Goal: provide the ability to run different GGUF models on a single GPU (GTX 1070 Ti) without manual command input in the terminal, with protection against system crashes due to VRAM shortage.

## 2. Architectural Decision Records (ADR)

### ADR 1: Why Flask, not FastAPI?
*   **Decision:** Flask.
*   **Rationale:** We don't need async at the web server level. API requests are rare (button clicks, status polling every 10 seconds). All heavy lifting (waiting for model startup) is delegated to the bash script `manager.sh` via `subprocess`. Flask is easier to install system-wide (`apt install python3-flask`) without creating virtual environments (venv), saving SSD space.

### ADR 2: Why Vanilla JS, not React/Vue?
*   **Decision:** Pure JavaScript (ES6) and CSS Grid.
*   **Rationale:** No build step (Webpack, Vite, npm). Frontend code is served directly by Flask to the browser. Easily debugged directly in the browser console without source maps. Ideal for a local tool.

### ADR 3: Why `tmux`, not `systemd`?
*   **Decision:** Launching models in background `tmux` sessions (e.g., `tmux new-session -d -s llama-asya`).
*   **Rationale:** `systemd` requires `sudo` privileges, creating `.service` files, and `daemon-reload` on every argument change. `tmux` allows running a process as a regular user, easily attaching to it (`tmux attach`) for real-time logs, and killing it with one command.

### ADR 4: Why JSON model cache on SSD, not SQLite/PostgreSQL?
*   **Decision:** `models_cache.json` file, updated via a button.
*   **Rationale:** Scanning an HDD with 700+ GB of models takes seconds. Doing this on every page request would make the interface sluggish. A JSON file on an SSD reads in milliseconds. A database is overkill for storing a flat list of paths.

### ADR 5: How is VRAM consumption calculated (Heuristic)?
*   **Decision:** `app.py` uses the formula: `(File_size_in_MB) * (Number_of_layers / 99.0) + 500 MB (for KV cache)`.
*   **Rationale:** `llama.cpp` does not have an API that can pre-calculate exact memory usage. The flag `--n-gpu-layers 99` means "load everything". The heuristic assumes a linear dependency: if we load half the layers (49), we take half the file size. A 500 MB reserve insures against crashes with large context (`--ctx-size`).

## 3. Data Flow
1. User clicks "Start" on the `asya-chat` card.
2. JS sends `POST /api/action/asya-chat/start`.
3. Flask calls `subprocess.run(["./manager.sh", "asya-chat", "start"])`.
4. `manager.sh` reads `instances/asya-chat.conf`, checks port availability, starts `tmux new-session ... llama-server ...`.
5. `manager.sh` polls `http://127.0.0.1:8080/health` in a loop.
6. When the port opens, `manager.sh` returns exit code 0.
7. Flask returns JSON `{"output": "✅ DONE!"}` to the frontend.
8. JS turns the indicator green.

## 4. Known Limitations
*   No authentication (assumes use in a trusted local network).
*   VRAM check is approximate. If the model crashes with OOM, the interface will show "ERROR" but cannot prevent it 100%.
