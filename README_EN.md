# 🦙 LlamaPanel (LLM Server Manager)

**Author:** Kayro
**Repository:** https://github.com/Ivanow/llama_panel

A web panel for easy management of local LLM servers based on `llama.cpp`. It allows you to start, stop, and edit model configurations through a modern web interface, bypassing manual argument typing in the terminal.

## 🚀 Features
- **Lifecycle Management**: Start, stop, and restart servers with one click (via `tmux`).
- **Smart Resource Check**: The panel automatically queries `nvidia-smi` and system memory (RAM). If the model does not fit into free VRAM or RAM, the card is blocked.
- **Port Checking**: Prevents running two servers on the same port.
- **Visual Argument Builder**: Convenient selection of parameters (`--n-gpu-layers`, `--ctx-size`, Flash Attention, Draft, Vision, etc.) with automatic string assembly.
- **Built-in File Explorer**: Select `.gguf` files directly from the web interface without copying paths.

## 🛠 Requirements
- **OS**: Linux (tested on Ubuntu 22.04).
- **Python**: 3.10+
- **Utilities**: `tmux`, `curl`, `ss` (`iproute2` package).
- **Engine**: Compiled `llama-server` binary from [llama.cpp](https://github.com/ggerganov/llama.cpp).

## 📦 Installation and Launch

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Ivanow/llama_panel.git
   cd llama_panel
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Prepare the llama.cpp binary:**
   Compile `llama.cpp` for your GPU (e.g., `-DCMAKE_CUDA_ARCHITECTURES=61` for Pascal) and place the `llama-server` binary at:
   `build/bin/llama-server`
   *(Make sure the file is executable: `chmod +x build/bin/llama-server`)*.

4. **Make the manager script executable:**
   ```bash
   chmod +x manager.sh
   ```

5. **Start the panel server:**
   ```bash
   python3 web_panel/app.py
   ```
   *(The panel runs on port `8090` by default)*.

6. **Open in browser:**
   Navigate to `http://<YOUR_SERVER_IP>:8090`.

## 📄 Documentation
Full description of architecture, algorithms, and decisions is located in the `doc/` folder:
- `doc/ssot/ssot.md` — global architecture.
- `doc/ssot/ssot_manager_sh.md` — bash script passport.
- `doc/ssot/ssot_app_py.md` — backend passport.
- `doc/ssot/ssot_script_js.md` — frontend passport.
