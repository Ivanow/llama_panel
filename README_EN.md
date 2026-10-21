# 🦙 LlamaPanel (LLM Server Manager)

**Author:** Kayro  
**Repository:** https://github.com/Ivanow/llama_panel

A web panel for convenient management of local LLM servers based on `llama.cpp`. It allows you to start, stop, and edit model configurations through a modern web interface, avoiding the need to manually type arguments in the terminal.

## 🚀 Key Features

- **Lifecycle Management**: Start, stop, and restart servers with a single click (via `tmux`).
- **Smart Resource Checking**: The panel automatically polls `nvidia-smi` and system RAM.
- **Port Conflict Protection**: Prevents launching two servers on the same port.
- **Visual Argument Builder**: Easy selection of parameters (Flash Attention, Draft, Vision, etc.).
- **Built-in File Explorer**: Select `.gguf` files directly from the web interface.

## 📦 Installation (Linux - Ubuntu/Debian)

### Requirements
- Linux (Ubuntu 20.04+, Debian 11+)
- Python 3.8+
- Minimum 4 GB RAM (for compilation)
- Optional: NVIDIA GPU with CUDA drivers

### Quick Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Ivanow/llama_panel.git
   cd llama_panel
   ```

2. **Run the installation script:**
   The script will automatically:
   - Install system dependencies (git, cmake, tmux, curl, build-essential)
   - Create a Python virtual environment
   - Compile `llama.cpp` for your hardware
   - Install all required Python packages
   
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

3. **Start the panel:**
   ```bash
   source venv/bin/activate
   python3 web_panel/app.py
   ```

4. **Open the panel:**
   Navigate to `http://localhost:8090` in your browser.

## 📖 Usage

### Adding a Model

1. Open the web panel in your browser.
2. Click "Create Instance".
3. Specify:
   - **Name**: A unique name for the instance (e.g., `llama3-8b`).
   - **Port**: The server port (e.g., `8080`).
   - **Model**: Path to the `.gguf` file.
   - **Arguments**: Additional launch parameters (optional).
4. Click "Save".

### Managing the Server

- **Start**: Click the "Start" button next to the desired instance.
- **Stop**: Click the "Stop" button.
- **Logs**: View real-time logs via the "Logs" button.

### Viewing Models

The panel automatically scans the `/stor001/models` directory for `.gguf` files. You can refresh the model list using the "Refresh" button in the "Models" section.

## 🛠️ Manual Installation (For Advanced Users)

If the automated installation does not suit your needs:

```bash
# 1. Install system dependencies
sudo apt update
sudo apt install -y git cmake tmux curl build-essential

# 2. Clone the repository
git clone https://github.com/Ivanow/llama_panel.git
cd llama_panel

# 3. Create a virtual environment
python3 -m venv venv
source venv/bin/activate

# 4. Install Python dependencies
pip install -r requirements.txt

# 5. Compile llama.cpp
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j $(nproc)
cd ..

# 6. Prepare files
mkdir -p build/bin
cp llama.cpp/build/bin/llama-server build/bin/
chmod +x build/bin/llama-server manager.sh

# 7. Start the panel
python3 web_panel/app.py
```

## ⚙️ Configuration

Instance configurations are stored in the `instances/` directory in `.conf` format. Example:

```bash
MODEL="/path/to/model.gguf"
PORT=8080
ALIAS="my-model"
EXTRA_ARGS="--ctx-size 4096 --threads 4"
```

## 🐛 Troubleshooting

### Error: "Permission denied" when running install.sh
```bash
chmod +x install.sh
```

### Error: "externally managed environment"
Always use a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Compilation fails with "Killed" or "OOM"
Insufficient RAM. Limit the compilation threads:
```bash
cd llama.cpp
cmake --build build --config Release -j 2
```

### Port 8090 is already in use
Change the port in `web_panel/app.py` or free up the port:
```bash
sudo lsof -i :8090
sudo kill -9 <PID>
```

## 📄 License

MIT License

## 🤝 Support

If you encounter any issues, please create an Issue in the repository.