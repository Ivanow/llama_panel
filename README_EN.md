# 🦙 LlamaPanel (LLM Server Manager)

**[Russian version (README.md)](README.md)**

**Author:** Kayro
**Repository:** https://github.com/Ivanow/llama_panel

A web panel for easy management of local LLM servers based on `llama.cpp`. It allows you to start, stop, and edit model configurations through a modern web interface, bypassing manual argument typing in the terminal.

![LlamaPanel Screenshot](doc/images/llama_panel.jpg)

## 🚀 Features
- **Lifecycle Management**: Start, stop, and restart servers with one click (via `tmux`).
- **Smart Resource Check**: The panel automatically queries `nvidia-smi` and system memory (RAM).
- **Port Checking**: Prevents running two servers on the same port.
- **Visual Argument Builder**: Convenient selection of parameters (Flash Attention, Draft, Vision, etc.).
- **Built-in File Explorer**: Select `.gguf` files directly from the web interface.

## 📦 Quick Installation (Linux)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Ivanow/llama_panel.git
   cd llama_panel
   ```

2. **Run the installation script:**
   It will check dependencies (CUDA, cmake), download `llama.cpp` sources, compile them for your hardware, and place the binaries in the correct folders.
   ```bash
   ./install.sh
   ```

3. **Install Python dependencies and run:**
   ```bash
   pip install -r requirements.txt
   python3 web_panel/app.py
   ```

4. **Open the panel:**
   Navigate to `http://<YOUR_SERVER_IP>:8090`.

## 📄 Documentation
Full description of architecture and algorithms is located in the `doc/` folder.
