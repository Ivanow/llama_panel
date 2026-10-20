# File Passport: `script.js`

**Path:** `llama_server/web_panel/static/script.js`
**Role:** DOM Management, API polling, argument builder.

## 1. Smart Argument Builder (`buildArgs` and `onModeChange`)
The interface does not allow assembling a "junk" config. When changing mode (`<select id="run-mode">`), the `onModeChange` function rebuilds the form:

| Mode | Visible Blocks | Hidden Blocks | Default `--ctx-size` |
|---|---|---|---|
| `chat` | All | - | 8192 |
| `coder` | Reasoning, Draft | Vision | 16384 |
| `vision` | Vision, Reasoning | Draft (breaks vision) | 4096 |
| `embedding` | Pooling | Generation, Reasoning, Vision | 2048 |
| `rerank` | Pooling=rank | Generation, Vision | 512 |

The `buildArgs` function assembles the string `--n-gpu-layers 9 --ctx-size ...`, checking the checkboxes.
*   If `Flash Attention` is enabled, it automatically adds `--cache-type-k q8_0`.
*   If coder mode is selected and a draft model is specified, it **automatically** adds `--spec-type draft-simple` (requirement of newer llama.cpp versions).

## 2. File Explorer
*   The frontend receives a flat list of paths from the backend (`gguf_models/qwen/model.gguf`).
*   `buildTree()`: Turns the flat list into a hierarchical JSON (folder tree).
*   `renderExplorer()`: Draws the current folder. Search works. Clicking a file substitutes the full path into `input id="new-model"` and closes the window.

## 3. Card Management
*   **Status:** Polling every 10 seconds (`setInterval`).
*   **Button Locking:** If status is `RUNNING`, the "Start" button becomes `disabled`. If `STOPPED` — "Stop" and "Restart" become `disabled`.
*   **Disabled Cards:** If the backend returned `can_start: false`, the card gets the `.disabled` class (grey color, `pointer-events: none`), and the reason (e.g., "Insufficient VRAM") is displayed under the model name.
