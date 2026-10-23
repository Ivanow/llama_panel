import os
import subprocess
import glob
import re
import logging
import json
import shlex
import shutil
from flask import Flask, jsonify, render_template, request, make_response

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

WEB_PANEL_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.abspath(os.path.dirname(WEB_PANEL_DIR))
INSTANCES_DIR = os.path.join(BASE_DIR, "instances")
MANAGER_SH = os.path.join(BASE_DIR, "manager.sh")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

LOG_FILE = os.path.join(WEB_PANEL_DIR, "panel_error.log")
logging.basicConfig(filename=LOG_FILE, level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Конфигурация и Поиск бинарника ---
def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"Ошибка чтения config.json: {e}")
    return None

def find_llama_server():
    # 1. Проверяем стандартные места и соседние папки
    candidates = [
        os.path.join(BASE_DIR, "build", "bin", "llama-server"),             # В папке проекта
        os.path.join(BASE_DIR, "..", "llama_server", "build", "bin", "llama-server"), # В соседней папке llama_server
        os.path.expanduser("~/llama.cpp/build/bin/llama-server"),           # Домашняя папка llama.cpp
        "/usr/local/bin/llama-server",                                      # Системная установка
        "/usr/bin/llama-server"
    ]
    
    for p in candidates:
        if os.path.exists(p) and os.path.isfile(p):
            return os.path.abspath(p)
            
    # 2. Ищем в системе (PATH)
    sys_bin = shutil.which("llama-server")
    if sys_bin:
        return sys_bin
    return ""

def get_model_roots():
    cfg = load_config()
    if cfg and "models_dir" in cfg:
        md = cfg["models_dir"]
        if isinstance(md, str): return [md]
        if isinstance(md, list): return md
    return ["/"]

# --- Локализация ---
LOCALES_DIR = os.path.join(WEB_PANEL_DIR, "locales")
DEFAULT_LOCALE = "ru"
LOCALE_NAMES = {"ru": "Русский", "en": "English", "tr": "Türkçe", "zh_CN": "中文(简体)", "de": "Deutsch", "fr": "Français", "es": "Español", "uk": "Українська", "kk": "Қазақша"}

def available_locales():
    codes = [os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(LOCALES_DIR, "*.json"))]
    codes.sort()
    return codes or [DEFAULT_LOCALE]

def get_locale(req=None):
    req = req or request
    lang = req.args.get('lang') or req.headers.get('X-Lang') or req.cookies.get('lang') or DEFAULT_LOCALE
    return lang if lang in available_locales() else DEFAULT_LOCALE

def load_locale(lang):
    try:
        with open(os.path.join(LOCALES_DIR, f"{lang}.json"), 'r', encoding='utf-8') as f:
            return json.load(f)
    except: return {}

def tr(key, lang=None, **kwargs):
    lang = lang or get_locale()
    pack = load_locale(lang) or load_locale(DEFAULT_LOCALE)
    base = load_locale(DEFAULT_LOCALE)
    template = pack.get(key) or base.get(key) or key
    try: return template.format(**kwargs)
    except: return template

def err(msg_key, status=400, lang=None, **kwargs):
    return jsonify({"error": tr(msg_key, lang, **kwargs)}), status

def is_valid_name(name):
    return bool(re.match(r'^[a-zA-Z0-9_-]+$', name))

# --- Системные ресурсы и Конфиги ---
def get_system_resources():
    free_vram, free_ram = 0, 0
    try:
        res = subprocess.run(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,nounits,noheader'], capture_output=True, text=True)
        if res.returncode == 0: free_vram = int(res.stdout.strip())
        with open('/proc/meminfo', 'r') as f:
            for line in f:
                if line.startswith('MemAvailable:'):
                    free_ram = int(line.split()[1]) // 1024
                    break
    except Exception as e:
        logging.error(f"Ошибка получения ресурсов: {e}")
    return free_vram, free_ram

def parse_conf(conf_path):
    port, model, gpu_layers, model_path, extra_args = "?", "?", 0, "", ""
    try:
        with open(conf_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key, val = key.strip(), val.strip().strip('"').strip("'")
                    if key == 'PORT': port = val
                    elif key == 'MODEL':
                        model = os.path.basename(val)
                        model_path = val
                    elif key == 'EXTRA_ARGS':
                        extra_args = val
                        match = re.search(r'--n-gpu-layers\s+(\d+)', val)
                        if match: gpu_layers = int(match.group(1))
    except Exception as e:
        logging.error(f"Ошибка парсинга конфига {conf_path}: {e}")
    return port, model, gpu_layers, model_path, extra_args

def is_session_running(name):
    return subprocess.run(['tmux', 'has-session', '-t', f'llama-{name}'], capture_output=True).returncode == 0

# --- Локализация статусов ---
STATUS_KIND_KEYS = {"RUNNING": "status_running", "LOADING": "status_loading", "STOPPED": "status_stopped", "ERROR": "status_error"}
STATUS_DETAIL_KEYS = [
    ("сессия не найдена", "status_detail_session_not_found", None), ("no server running", "status_detail_session_not_found", None), ("session not found", "status_detail_session_not_found", None),
    ("/health ok", "status_detail_port_health", 1), ("модель еще не готова", "status_detail_port_loading", 1), ("модель ещё не готова", "status_detail_port_loading", 1), ("model is not ready", "status_detail_port_loading", 2),
    ("не слушается", "status_detail_port_down", 5), ("is not listening", "status_detail_port_down", 4)
]
ICON_BY_KIND = {"running": "🟢 ", "loading": "🟡 ", "stopped": "⚪ ", "error": "🔴 "}

def localize_status(raw, name, lang):
    raw = (raw or "").strip()
    kind = next((k for k in STATUS_KIND_KEYS if re.search(k, raw)), None)
    if not kind: return raw
    low = raw.lower()
    detail_key, port_idx = None, None
    for frag, key, idx in STATUS_DETAIL_KEYS:
        if frag in low:
            detail_key, port_idx = key, idx
            break
    port = "?"
    conf_path = os.path.join(INSTANCES_DIR, f"{name}.conf")
    if os.path.exists(conf_path): port = parse_conf(conf_path)[0]
    label = tr(STATUS_KIND_KEYS[kind], lang)
    detail = ""
    if detail_key:
        detail = tr(detail_key, lang, port=port)
        if port_idx is None:
            m = re.search(r'(\d{4,5})', raw)
            if m and 'порт' in detail: detail = detail.replace('порт', f"порт {m.group(1)}", 1)
    icon = ICON_BY_KIND.get(kind.lower(), "")
    return f"{icon}{label} ({detail})" if detail else f"{icon}{label}"

# --- Файловый браузер ---
MAX_FILES_PER_DIR = 500

def is_under_roots(path):
    roots = get_model_roots()
    if roots == ["/"]: return True
    try:
        norm = os.path.normpath(os.path.abspath(path))
        for root in roots:
            if os.path.commonpath([os.path.normpath(os.path.abspath(root)), norm]) == os.path.normpath(os.path.abspath(root)):
                return True
    except: pass
    return False

def human_size(nbytes):
    gb = nbytes / (1024 ** 3)
    return f"{round(gb, 2)} GB" if gb >= 1 else f"{max(1, round(nbytes / (1024 ** 2)))} MB"

@app.route('/api/browse/roots')
def browse_roots():
    roots = get_model_roots()
    return jsonify({"roots": [{"path": r, "exists": os.path.isdir(r)} for r in roots]})

@app.route('/api/browse')
def browse_dir():
    lang = get_locale()
    rel = request.args.get('path', '') or ''
    show_all = request.args.get('show_all', 'false').lower() == 'true'
    roots = get_model_roots()
    full_access = roots == ["/"]
    
    target = os.path.abspath(rel) if os.path.isabs(rel) else os.path.abspath(os.path.join(roots[0] if roots else '/', rel.lstrip('/')))
    
    if not is_under_roots(target): return err("err_path_forbidden", 403, lang=lang)
    if not os.path.isdir(target): return err("err_path_not_found", 404, lang=lang)

    folders, files = [], []
    try:
        with os.scandir(target) as it:
            entries = sorted(it, key=lambda e: e.name.lower())
    except Exception:
        return err("err_generic", 500, lang=lang)

    for entry in entries:
        try:
            if entry.is_dir():
                folders.append({"name": entry.name, "path": os.path.join(target, entry.name)})
            elif ((show_all and entry.is_file()) or entry.name.lower().endswith('.gguf')) and entry.is_file():
                if len(files) >= MAX_FILES_PER_DIR: continue
                full = os.path.join(target, entry.name)
                size = os.path.getsize(full)
                files.append({"name": entry.name, "path": full, "size_gb": round(size/(1024**3), 2), "size_human": human_size(size)})
        except: continue

    parent = os.path.dirname(target) if target != "/" else ""
    can_go_up = bool(parent) and (full_access or is_under_roots(parent))
    
    return jsonify({
        "cwd": target, "root": roots[0] if roots else "/",
        "parent": parent if can_go_up else None,
        "folders": folders, "files": files
    })

# --- Основные API ---
@app.route('/')
def index():
    lang = get_locale()
    resp = make_response(render_template('index.html', locale=lang))
    resp.set_cookie('lang', lang, max_age=365*24*3600, samesite='Lax')
    return resp

@app.route('/api/i18n')
def get_i18n():
    lang = get_locale()
    return jsonify({"lang": lang, "available": {c: LOCALE_NAMES.get(c, c) for c in available_locales()}, "strings": load_locale(lang)})

@app.route('/api/settings', methods=['GET'])
def get_settings():
    cfg = load_config()
    if not cfg:
        detected = find_llama_server()
        return jsonify({"needs_onboarding": True, "detected_binary": detected, "default_models_dir": os.path.join(BASE_DIR, "models")})
    return jsonify({"needs_onboarding": False, "models_dir": cfg.get("models_dir", "/"), "llama_binary": cfg.get("llama_binary", "")})

@app.route('/api/settings', methods=['POST'])
def save_settings():
    data = request.json
    cfg = load_config() or {}
    cfg["models_dir"] = data.get("models_dir", "/")
    cfg["llama_binary"] = data.get("llama_binary", "")
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=4, ensure_ascii=False)
        return jsonify({"status": "OK"})
    except: return err("err_generic", 500)

@app.route('/api/instances')
def get_instances():
    lang = get_locale()
    instances = []
    free_vram, free_ram = get_system_resources()
    confs = glob.glob(os.path.join(INSTANCES_DIR, "*.conf"))
    parsed_data, running_ports = [], []

    for conf_path in confs:
        name = os.path.basename(conf_path).replace(".conf", "")
        if not is_valid_name(name): continue
        port, model, gpu_layers, model_path, extra_args = parse_conf(conf_path)
        is_running = is_session_running(name)
        parsed_data.append({"name": name, "port": port, "model": model, "args": extra_args, "gpu_layers": gpu_layers, "model_path": model_path, "is_running": is_running})
        if is_running and port != "?": running_ports.append(port)

    for data in parsed_data:
        can_start, reason = True, ""
        if not data["is_running"]:
            if data["port"] in running_ports:
                can_start, reason = False, tr("reason_port_busy", lang, port=data['port'])
            elif os.path.exists(data["model_path"]):
                file_size_mb = os.path.getsize(data["model_path"]) / (1024 * 1024)
                actual_gpu = min(data["gpu_layers"], 99)
                vram_needed = file_size_mb * (actual_gpu / 99.0) + 500
                ram_needed = file_size_mb * ((99.0 - actual_gpu) / 99.0) + 1000
                if free_vram < vram_needed: can_start, reason = False, tr("reason_no_vram", lang, need=int(vram_needed), free=free_vram)
                elif free_ram < ram_needed: can_start, reason = False, tr("reason_no_ram", lang, need=int(ram_needed), free=free_ram)
            else:
                can_start, reason = False, tr("err_model_not_found", lang)

        instances.append({
            "name": data["name"], "port": data["port"], "model": data["model"], "args": data["args"],
            "can_start": can_start, "reason": reason, "is_running": data["is_running"], "model_path": data["model_path"]
        })
    return jsonify(instances)

@app.route('/api/status/<name>', methods=['GET'])
def get_status(name):
    if not is_valid_name(name): return err("err_invalid_name")
    lang = get_locale()
    try:
        result = subprocess.run([MANAGER_SH, name, "status"], capture_output=True, text=True, timeout=5)
        return jsonify({"status": localize_status(result.stdout.strip(), name, lang)})
    except:
        return jsonify({"status": "🔴 ERROR"})

@app.route('/api/action/<name>/<action>', methods=['POST'])
def control_instance(name, action):
    if not is_valid_name(name) or action not in ['start', 'stop', 'restart']: return err("err_invalid_name")
    try:
        result = subprocess.run([MANAGER_SH, name, action], capture_output=True, text=True, timeout=120)
        return jsonify({"output": result.stdout + result.stderr})
    except: return err("err_server", 500)

@app.route('/api/instances/create', methods=['POST'])
def create_instance():
    data = request.json
    name, port, model, args = data.get('name', '').strip(), data.get('port', '').strip(), data.get('model', '').strip(), data.get('args', '').strip()
    if not is_valid_name(name): return err("err_invalid_name")
    if not port.isdigit() or not (1024 <= int(port) <= 65535): return err("err_invalid_port")
    if not os.path.exists(model): return err("err_model_not_found")
    
    conf_path = os.path.join(INSTANCES_DIR, f"{name}.conf")
    if os.path.exists(conf_path): return err("err_name_taken")

    for c_path in glob.glob(os.path.join(INSTANCES_DIR, "*.conf")):
        p, _, _, _, _ = parse_conf(c_path)
        if p == port: return err("err_port_busy_conf", port=port, file=os.path.basename(c_path))

    try:
        with open(conf_path, 'w', encoding='utf-8') as f:
            f.write(f"MODEL={shlex.quote(model)}\nPORT={port}\nALIAS=\"{name}\"\nEXTRA_ARGS={shlex.quote(args)}\n")
        return jsonify({"status": "OK"})
    except: return err("err_server", 500)

@app.route('/api/instances/<name>/update', methods=['POST'])
def update_instance(name):
    if not is_valid_name(name): return err("err_invalid_name")
    if is_session_running(name): return err("err_running_stop_first")
    data = request.json
    port, model, args = data.get('port', '').strip(), data.get('model', '').strip(), data.get('args', '').strip()
    if not port.isdigit() or not (1024 <= int(port) <= 65535): return err("err_invalid_port")
    if not os.path.exists(model): return err("err_model_not_found")
    
    conf_path = os.path.join(INSTANCES_DIR, f"{name}.conf")
    if not os.path.exists(conf_path): return err("err_config_not_found", 404)

    for c_path in glob.glob(os.path.join(INSTANCES_DIR, "*.conf")):
        if c_path == conf_path: continue
        p, _, _, _, _ = parse_conf(c_path)
        if p == port: return err("err_port_busy_conf", port=port, file=os.path.basename(c_path))

    try:
        with open(conf_path, 'w', encoding='utf-8') as f:
            f.write(f"MODEL={shlex.quote(model)}\nPORT={port}\nALIAS=\"{name}\"\nEXTRA_ARGS={shlex.quote(args)}\n")
        return jsonify({"status": "OK"})
    except: return err("err_server", 500)

@app.route('/api/instances/<name>/delete', methods=['POST'])
def delete_instance(name):
    if not is_valid_name(name): return err("err_invalid_name")
    conf_path = os.path.join(INSTANCES_DIR, f"{name}.conf")
    if not os.path.exists(conf_path): return err("err_config_not_found", 404)
    if is_session_running(name): return err("err_running_stop_first")
    try:
        os.remove(conf_path)
        return jsonify({"status": "OK"})
    except: return err("err_server", 500)



@app.route('/README.md')
@app.route('/README_ru.md')
def serve_readme_files():
    from flask import send_from_directory
    filename = request.path.strip('/')
    return send_from_directory(BASE_DIR, filename)

@app.route('/api/guide')
def get_guide():
    lang = get_locale()
    readme_file = 'README_ru.md' if lang == 'ru' else 'README.md'
    readme_path = os.path.join(BASE_DIR, readme_file)
    try:
        with open(readme_path, 'r', encoding='utf-8') as f:
            return f.read(), 200, {'Content-Type': 'text/plain; charset=utf-8'}
    except Exception as e:
        logging.error(f"Ошибка чтения README: {e}")
        return f"{readme_file} not found", 404

if __name__ == '__main__':

    import logging as _logging
    _logging.getLogger('werkzeug').setLevel(_logging.ERROR)
    try:
        print("======================================")
        print("🚀 Панель управления LlamaPanel запущена!")
        print("👉 Откройте в браузере: http://<IP_СЕРВЕРА>:8090")
        print("======================================")
        app.run(host='0.0.0.0', port=8090, debug=False)
    except OSError as e:
        if "Address already in use" in str(e) or "10048" in str(e):
            print("\n❌ ОШИБКА: Порт 8090 уже занят другим процессом.")
        else:
            print(f"\n❌ ОШИБКА при запуске сервера: {e}")
