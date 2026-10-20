# 📖 LlamaPanel User Guide

## 1. Main Screen
The main screen displays cards for all created configurations. Each card contains:
- **Config Name** and **Port**.
- **Status**:
  - 🟢 `RUNNING` — server is running (model in memory).
  - 🟡 `LOADING` — model is loading into memory.
  - 🔴 `STOPPED` — server is off.
- **Control Buttons**: "Start", "Stop", "Restart".
- **Pencil** (✏️) — edit config.
- **Trash** (🗑️) — delete config (available only for stopped servers).

### ⚠️ Grey Cards (Foolproofing)
If a card turns grey, it means the launch is blocked. The reason is displayed directly under the model name:
- **"Insufficient VRAM"**: You tried to start a model when video memory is already occupied by other running servers. Stop them first.
- **"Insufficient RAM"**: Same for system RAM (relevant for CPU inference).
- **"Port busy by another server"**: You are trying to start a config on a port already listening on another running server.
- **"Model file not found"**: The model was deleted from the disk or the path is incorrect.

## 2. Creating a New Server
1. Click **"Add Server"**.
2. Enter **Config Name** (Latin letters, numbers, hyphens only).
3. Specify **Port** (default 8081).
4. Click **"Browse"** and select the `.gguf` model in the file explorer that appears.
5. Select **Work Mode** (Chat, Coder, Vision, Embeddings, Reranking). Default parameters depend on this.
6. Click **"Configure"** to set GPU layers, context, enable Jinja, Reasoning, Draft, or specify a projector (mmproj).
7. Click **"Apply Arguments"**, then **"Create Config"**.

## 3. Editing
Click the pencil icon on the card. You can change arguments (e.g., set `--n-gpu-layers 99` to load the model entirely into VRAM). The config name cannot be changed.
*(If the server is running, the edit button is disabled — click "Stop" first).*
