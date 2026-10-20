# File Passport: `app.py`

**Path:** `llama_server/web_panel/app.py`
**Role:** REST API, business logic, validation, resource calculation.

## 1. Algorithm `get_instances` (Two-Pass Parsing)
This method solves the task: "You cannot start a model if there is not enough memory or the port is busy".
1.  **Pass 1 (Data Collection):**
    *   Scan `instances/*.conf` folder.
    *   Parse `PORT` and `MODEL` (regex) for each file.
    *   Execute `tmux has-session -t llama-<name>` to find out if the server is running.
    *   If running — add its port to the `running_ports` list.
2.  **Pass 2 (Resource Calculation):**
    *   Get `free_vram` (via `nvidia-smi`) and `free_ram` (via `/proc/meminfo`).
    *   For each **disabled** config:
        *   If its port is in `running_ports` — block (`can_start = false`).
        *   Otherwise calculate memory: `size_mb = os.path.getsize(model)`.
        *   `vram_needed = size_mb * (gpu_layers / 99.0) + 500`
        *   `ram_needed = size_mb * ((99 - gpu_layers) / 99.0) + 1000`
        *   If `free_vram < vram_needed` or `free_ram < ram_needed` — block.

## 2. Algorithm `create_instance` (Security)
1.  Check `re.match(r'^[a-zA-Z0-9_-]+$', name)`.
2.  Check port (`1024 <= port <= 65535`).
3.  **Injection Protection:** Escaping arguments via `shlex.quote(model)` and `shlex.quote(args)`. This guarantees that if quotes are encountered in arguments (e.g., `--chat-template-kwargs '{"a": 1}'`), they won't break the bash script.
4.  Check that the port is not already taken by another `.conf`.
5.  Write file.

## 3. Model Caching (We don't download models every day)
*   `scan_models_to_cache()`: Recursively traverses `/stor001/models` (up to 6 levels deep). Saves found `.gguf` files to `models_cache.json`.
*   **Atomic Write:** Writes to `models_cache.tmp` first, then calls `os.replace()`. This protects against reading broken JSON if the user clicks "Refresh" while reading.
