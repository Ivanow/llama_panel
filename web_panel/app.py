import os
import subprocess
import glob
import re
import logging
import json
import shlex
from flask import Flask, jsonify, render_template, request, make_response

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

log_file = "/stor001/llama_server/web_panel/panel_error.log"
logging.basicConfig(filename=log_file, level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

BASE_DIR = "/stor001/llama_server"
INSTANCES_DIR = os.path.join(BASE_DIR, "instances")
MANAGER_SH = os.path.join(BASE_DIR, "manager.sh")
MODELS_DIR = "/stor001/models"
CACHE_FILE = os.path.join(BASE_DIR, "web_panel", "models_cache.json")

# --- Локализация (языковые пакеты подгружаются динамически из папки locales) ---
LOCALES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "locales")
DEFAULT_LOCALE = "ru"
LOCALE_NAMES = {  # display names for language menu; unknown codes shown as-is
    "ru": "Русский",
    "en": "English",
    "tr": "Türkçe",
    "de": "Deutsch",
    "fr": "Français",
    "es": "Español",
    "uk": "Українська",
    "kk": "Қазақша",
}

def available_locales():
    """Список языков, для которых есть файл locales/<код>.json (меню строится автоматически)."""
    codes = []
    try:
        for path in glob.glob(os.path.join(LOCALES_DIR, "*.json")):
            code = os.path.splitext(os.path.basename(path))[0]
            if re.match(r'^[a-zA-Z0-9_-]+$', code):
                codes.append(code)
    except Exception as e:
        logging.error(f"Ошибка чтения папки локалей: {e}")
    codes.sort()
    if not codes:
        codes = [DEFAULT_LOCALE]
    return codes

def get_locale(req=None):
    req = req or request
    lang = (req.args.get('lang') or req.headers.get('X-Lang') or
            req.cookies.get('lang') or DEFAULT_LOCALE)
    if lang not in available_locales():
        lang = DEFAULT_LOCALE
    return lang

def load_locale(lang):
    try:
        with open(os.path.join(LOCALES_DIR, f"{lang}.json"), 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logging.error(f"Ошибка загрузки локали {lang}: {e}")
        return {}

def tr(key, lang=None, **kwargs):
    """Перевод сообщения на бэкенде с fallback на русский."""
    lang = lang or get_locale()
    pack = load_locale(lang) or load_locale(DEFAULT_LOCALE)
    base = load_locale(DEFAULT_LOCALE)
    template = pack.get(key) or base.get(key) or key
    try:
        return template.format(**kwargs)
    except (KeyError, IndexError):
        return template

def err(msg_key, status=400, lang=None, **kwargs):
    return jsonify({"error": tr(msg_key, lang, **kwargs)}), status

def is_valid_name(name):
    return bool(re.match(r'^[a-zA-Z0-9_-]+$', name))

def get_system_resources():
    free_vram = 0
    free_ram = 0
    try:
        res = subprocess.run(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,nounits,noheader'], capture_output=True, text=True)
        if res.returncode == 0:
            free_vram = int(res.stdout.strip())
        
        with open('/proc/meminfo', 'r') as f:
            for line in f:
                if line.startswith('MemAvailable:'):
                    free_ram = int(line.split()[1]) // 1024
                    break
    except Exception as e:
        logging.error(f"Ошибка получения ресурсов: {e}")
    return free_vram, free_ram

def parse_conf(conf_path):
    port = "?"
    model = "?"
    gpu_layers = 0
    model_path = ""
    extra_args = ""
    try:
        with open(conf_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key == 'PORT': port = val
                    elif key == 'MODEL':
                        model = os.path.basename(val)
                        model_path = val
                    elif key == 'EXTRA_ARGS':
                        extra_args = val
                        match = re.search(r'--n-gpu-layers\s+(\d+)', val)
                        if match:
                            gpu_layers = int(match.group(1))
    except Exception as e:
        logging.error(f"Ошибка парсинга конфига {conf_path}: {e}")
    return port, model, gpu_layers, model_path, extra_args

def is_session_running(name):
    res = subprocess.run(['tmux', 'has-session', '-t', f'llama-{name}'], capture_output=True)
    return res.returncode == 0

def scan_models_to_cache():
    models_list = []
    try:
        for root, dirs, files in os.walk(MODELS_DIR):
            if root[len(MODELS_DIR):].count(os.sep) > 6:
                dirs[:] = []
                continue
            for file in files:
                if file.lower().endswith('.gguf'):
                    full_path = os.path.join(root, file)
                    models_list.append({
                        "name": file, "path": full_path,
                        "rel_path": os.path.relpath(full_path, MODELS_DIR),
                        "size_gb": round(os.path.getsize(full_path) / (1024**3), 2)
                    })
        models_list.sort(key=lambda x: x['rel_path'])
        temp_cache = CACHE_FILE + ".tmp"
        with open(temp_cache, 'w', encoding='utf-8') as f:
            json.dump(models_list, f, ensure_ascii=False, indent=2)
        os.replace(temp_cache, CACHE_FILE)
        return True
    except Exception as e:
        logging.error(f"Ошибка сканирования: {e}")
        return False

@app.route('/')
def index():
    lang = get_locale()
    resp = make_response(render_template('index.html', locale=lang))
    resp.set_cookie('lang', lang, max_age=365*24*3600, samesite='Lax')
    return resp

@app.route('/api/i18n')
def get_i18n():
    """Возвращает языковой пакет + список доступных языков (меню строится динамически)."""
    lang = get_locale()
    locales = {}
    for code in available_locales():
        locales[code] = LOCALE_NAMES.get(code, code)
    return jsonify({
        "lang": lang,
        "available": locales,
        "strings": load_locale(lang) or load_locale(DEFAULT_LOCALE),
    })

@app.route('/api/instances')
def get_instances():
    lang = get_locale()
    instances = []
    free_vram, free_ram = get_system_resources()
    confs = glob.glob(os.path.join(INSTANCES_DIR, "*.conf"))
    
    parsed_data = []
    running_ports = []

    for conf_path in confs:
        name = os.path.basename(conf_path).replace(".conf", "")
        if not is_valid_name(name): continue
        
        port, model, gpu_layers, model_path, extra_args = parse_conf(conf_path)
        is_running = is_session_running(name)
        
        parsed_data.append({
            "name": name, "port": port, "model": model, "args": extra_args,
            "gpu_layers": gpu_layers, "model_path": model_path, "is_running": is_running
        })
        
        if is_running and port != "?":
            running_ports.append(port)

    for data in parsed_data:
        can_start = True
        reason = ""

        if not data["is_running"]:
            if data["port"] in running_ports:
                can_start = False
                reason = tr("reason_port_busy", lang, port=data['port'])
            
            elif os.path.exists(data["model_path"]):
                file_size_mb = os.path.getsize(data["model_path"]) / (1024 * 1024)
                actual_gpu_layers = min(data["gpu_layers"], 99)
                vram_needed = file_size_mb * (actual_gpu_layers / 99.0)
                ram_needed = file_size_mb * ((99.0 - actual_gpu_layers) / 99.0)
                
                if vram_needed > 0: vram_needed += 500 
                if ram_needed > 0: ram_needed += 1000 

                if free_vram < vram_needed:
                    can_start = False
                    reason = tr("reason_no_vram", lang, need=int(vram_needed), free=free_vram)
                elif free_ram < ram_needed:
                    can_start = False
                    reason = tr("reason_no_ram", lang, need=int(ram_needed), free=free_ram)
            else:
                can_start = False
                reason = tr("err_model_not_found", lang)

        instances.append({
            "name": data["name"], "port": data["port"], "model": data["model"], "args": data["args"],
            "can_start": can_start, "reason": reason, "is_running": data["is_running"]
        })
        
    return jsonify(instances)

@app.route('/api/status/<name>', methods=['GET'])
def get_status(name):
    if not is_valid_name(name): return err("err_invalid_name")
    try:
        result = subprocess.run([MANAGER_SH, name, "status"], capture_output=True, text=True, timeout=5)
        return jsonify({"status": result.stdout.strip()})
    except Exception as e:
        return jsonify({"status": "🔴 ERROR"})

@app.route('/api/action/<name>/<action>', methods=['POST'])
def control_instance(name, action):
    if not is_valid_name(name) or action not in ['start', 'stop', 'restart']: return err("err_invalid_name")
    try:
        result = subprocess.run([MANAGER_SH, name, action], capture_output=True, text=True, timeout=120)
        return jsonify({"output": result.stdout + result.stderr})
    except Exception as e:
        return err("err_server", 500)

@app.route('/api/instances/create', methods=['POST'])
def create_instance():
    lang = get_locale()
    data = request.json
    name = data.get('name', '').strip()
    port = data.get('port', '').strip()
    model = data.get('model', '').strip()
    args = data.get('args', '').strip()

    if not is_valid_name(name): return err("err_invalid_name", lang=lang)
    if not port.isdigit() or not (1024 <= int(port) <= 65535): return err("err_invalid_port", lang=lang)
    if not os.path.exists(model): return err("err_model_not_found", lang=lang)
    
    conf_path = os.path.join(INSTANCES_DIR, f"{name}.conf")
    if os.path.exists(conf_path): return err("err_name_taken", lang=lang)

    for c_path in glob.glob(os.path.join(INSTANCES_DIR, "*.conf")):
        p, _, _, _, _ = parse_conf(c_path)
        if p == port:
            return err("err_port_busy_conf", lang=lang, port=port, file=os.path.basename(c_path))

    try:
        safe_model = shlex.quote(model)
        safe_args = shlex.quote(args)
        conf_content = f"MODEL={safe_model}\nPORT={port}\nALIAS=\"{name}\"\nEXTRA_ARGS={safe_args}\n"
        with open(conf_path, 'w', encoding='utf-8') as f:
            f.write(conf_content)
        return jsonify({"status": "OK"})
    except Exception as e:
        logging.error(f"Ошибка создания инстанса {name}: {e}")
        return err("err_server", 500, lang=lang)

@app.route('/api/instances/<name>/update', methods=['POST'])
def update_instance(name):
    lang = get_locale()
    if not is_valid_name(name): return err("err_invalid_name", lang=lang)
    if is_session_running(name): return err("err_running_stop_first", lang=lang)

    data = request.json
    port = data.get('port', '').strip()
    model = data.get('model', '').strip()
    args = data.get('args', '').strip()

    if not port.isdigit() or not (1024 <= int(port) <= 65535): return err("err_invalid_port", lang=lang)
    if not os.path.exists(model): return err("err_model_not_found", lang=lang)
    
    conf_path = os.path.join(INSTANCES_DIR, f"{name}.conf")
    if not os.path.exists(conf_path): return err("err_config_not_found", 404, lang=lang)

    for c_path in glob.glob(os.path.join(INSTANCES_DIR, "*.conf")):
        if c_path == conf_path: continue
        p, _, _, _, _ = parse_conf(c_path)
        if p == port:
            return err("err_port_busy_conf", lang=lang, port=port, file=os.path.basename(c_path))

    try:
        safe_model = shlex.quote(model)
        safe_args = shlex.quote(args)
        conf_content = f"MODEL={safe_model}\nPORT={port}\nALIAS=\"{name}\"\nEXTRA_ARGS={safe_args}\n"
        with open(conf_path, 'w', encoding='utf-8') as f:
            f.write(conf_content)
        return jsonify({"status": "OK"})
    except Exception as e:
        logging.error(f"Ошибка обновления инстанса {name}: {e}")
        return err("err_server", 500, lang=lang)

@app.route('/api/instances/<name>/delete', methods=['POST'])
def delete_instance(name):
    lang = get_locale()
    if not is_valid_name(name): return err("err_invalid_name", lang=lang)
    conf_path = os.path.join(INSTANCES_DIR, f"{name}.conf")
    if not os.path.exists(conf_path): return err("err_config_not_found", 404, lang=lang)
    
    try:
        if is_session_running(name):
            return err("err_running_stop_first", lang=lang)
        os.remove(conf_path)
        return jsonify({"status": "OK"})
    except Exception as e:
        logging.error(f"Ошибка удаления инстанса {name}: {e}")
        return err("err_server", 500, lang=lang)

@app.route('/api/models', methods=['GET'])
def get_models():
    if not os.path.exists(CACHE_FILE): scan_models_to_cache()
    try:
        with open(CACHE_FILE, 'r', encoding='utf-8') as f: return jsonify(json.load(f))
    except: return err("err_generic", 500)

@app.route('/api/models/refresh', methods=['POST'])
def refresh_models():
    success = scan_models_to_cache()
    return jsonify({"status": "OK"}) if success else err("err_generic", 500)

if __name__ == '__main__':
    if not os.path.exists(CACHE_FILE):
        scan_models_to_cache()
    try:
        print("======================================")
        print("🚀 Панель управления LlamaPanel запущена!")
        print("👉 Откройте в браузере: http://<IP_СЕРВЕРА>:8090")
        print("======================================")
        app.run(host='0.0.0.0', port=8090, debug=False)
    except OSError as e:
        if "Address already in use" in str(e) or "10048" in str(e):
            print("\n❌ ОШИБКА: Порт 8090 уже занят другим процессом.")
            print("Возможно, панель уже запущена. Проверьте: ss -tulpn | grep 8090")
        else:
            print(f"\n❌ ОШИБКА при запуске сервера: {e}")
