# 🦙 LlamaPanel (LLM Server Manager)

**[Russian version (README.md)](README.md)**

**Author:** Kayro | **Repository:** https://github.com/Ivanow/llama_panel

A web panel for managing local LLM servers based on `llama.cpp`. Allows you to start, stop, and edit model configurations through a modern web interface. Includes resource checking (VRAM/RAM), port checking, and an argument builder.

![LlamaPanel Screenshot](doc/images/llama_panel.jpg)

## 📦 Installation (Linux)

Designed for Ubuntu/Debian-like systems.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Ivanow/llama_panel.git
   cd llama_panel
   ```

2. **Make the installation script executable:**
   ```bash
   chmod +x install.sh
   ```

3. **Run the installation:**
   The script will check for all dependencies (and prompt to install missing ones via `apt`), automatically download `llama.cpp` sources, compile them for your hardware (with CUDA support if found), and place the binaries in the correct folders.
   ```bash
   ./install.sh
   ```

4. **Install Python dependencies and run:**
   ```bash
   sudo apt install -y python3-flask
   python3 web_panel/app.py
   ```

5. **Open the panel:**
   Navigate to `http://<YOUR_SERVER_IP>:8090`.

## 📄 Documentation
Full description of architecture and algorithms is located in the `doc/` folder.
