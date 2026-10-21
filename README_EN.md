# 🦙 LlamaPanel (LLM Server Manager)

**[Russian version (README.md)](README.md)**

**Author:** Kayro | **Repository:** https://github.com/Ivanow/llama_panel

A web panel for managing local LLM servers based on `llama.cpp`. Allows you to start, stop, and edit model configurations through a modern web interface. Includes resource checking (VRAM/RAM), port checking, and an argument builder.

![LlamaPanel Screenshot](doc/images/llama_panel.jpg)

## 📦 Installation (Linux)

Designed for Ubuntu/Debian-like systems. You will need `sudo` privileges to install system packages.

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
   The script will automatically check and install missing system packages (`cmake`, `tmux`, `curl`, etc.), create an isolated Python environment (`venv`), download `llama.cpp` sources, and compile them for your hardware.
   *(If you have low RAM, the script will automatically limit build threads to prevent OOM crash).*
   ```bash
   ./install.sh
   ```

4. **Start the panel:**
   After successful installation, simply run:
   ```bash
   ./run.sh
   ```

5. **Open the panel:**
   Navigate to `http://<YOUR_SERVER_IP>:8090`.

## 📄 Documentation
Full description of architecture and algorithms is located in the `doc/` folder.
