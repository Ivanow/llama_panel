# File Passport: `manager.sh`

**Path:** `llama_server/manager.sh`
**Role:** Process Orchestrator.

## 1. Contracts (What the script guarantees)
1.  **Isolation:** Processes do not conflict, each has its own port and tmux session name (`llama-<name>`).
2.  **Fault Tolerance:** If a model crashes on load (corrupt file, OOM), the script detects it within 120 seconds and outputs the reason.
3.  **Syntax Safety:** Configs are checked via `bash -n` before execution.

## 2. Algorithm of `start` action
1.  Check if `instances/$INSTANCE.conf` exists.
2.  Check bash syntax validity: `bash -n $CONF`.
3.  Load variables (`source $CONF`).
4.  **tmux Check:** If session `llama-$INSTANCE` already exists — exit (model already running).
5.  **Port Check:** Execute `ss -tulpn | grep ":$PORT "`. If port is busy — exit with error.
6.  Start tmux in background:
    `tmux new-session -d -s "llama-$INSTANCE" "$BIN --model $MODEL --port $PORT ... > $LOG 2>&1"`
7.  **Healthcheck:** Run a loop for 60 iterations (2 sec each):
    *   Poll `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/health`
    *   If `200` — success.
    *   If tmux session disappeared (process crashed) — output `tail -n 20 $LOG` and exit with error.
    *   If 120 seconds passed — timeout.

## 3. Error Handling
*   **No config:** `ERROR: Config not found!`
*   **Syntax error in config:** `ERROR: Syntax error detected!`
*   **Port busy:** `ERROR: Port $PORT is busy!`
*   **Crash on load:** Script will output the last 20 lines of the log.

## 4. What the module does NOT do
*   Does not manage `llama.cpp` compilation (expects a ready binary).
*   Does not check free memory (Python backend does this).
*   Does not know about Flask.
