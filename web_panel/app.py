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

# --- Пути (можно переопределить переменными окружения LLAMA_BASE_DIR / LLAMA_MODELS_DIRS) ---
# LLAMA_MODELS_DIRS — список корневых папок для проводника моделей через запятую или ':'.
def _env_list(name):
    raw = os.environ.get(name, "")
    parts = []
    for chunk in re.split(r'[,:]', raw):
        chunk = chunk.strip()
        if chunk:
            parts.append(chunk)
    return parts

WEB_PANEL_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.abspath(os.environ.get("LLAMA_BASE_DIR") or os.path.dirname(WEB_PANEL_DIR))
INSTANCES_DIR = os.path.join(BASE_DIR, "instances")
MANAGER_SH = os.path.join(BASE_DIR, "manager.sh")
CACHE_FILE = os.path.join(BASE_DIR, "web_panel", "models_cache.json")

# Кандидаты по умолчанию, если LLAMA_MODELS_DIRS не задан.
# Жёстких путей к конкретному диску нет: модели ищутся в ~/models и в папке
# models/ рядом с репозиторием; любой другой диск/раздел пользователь указывает
# сам через LLAMA_MODELS_DIRS (например LLAMA_MODELS_DIRS=/mnt/nas/gguf,/data/models).
_DEFAULT_MODEL_ROOTS = [
    os.path.expanduser("~/models"),
    os.path.join(BASE_DIR, "models"),   # models/ рядом с репозиторием
]

def build_model_roots():
    """Whitelist корневых папок проводника моделей.

    1) Явные настройки всегда имеют приоритет (даже если пока не существуют):
       LLAMA_MODELS_DIRS (список через ',' или ':'), затем исторический MODELS_DIR.
    2) Если ничего не задано — берутся существующие кандидаты: стандартные
       ~/models и <репозиторий>/models, плюс папки моделей из конфигов
       instances/*.conf (модели могут лежать на любом диске/разделе);
       если и они отсутствуют — отдаём первый кандидат как «ожидаемый» путь,
       чтобы панель могла подсказать пользователю, что именно создать/настроить.

    Специальный корень "/" разрешает проводнику весь диск (навигация без ограничений).
    """
    env_roots = _env_list("LLAMA_MODELS_DIRS")
    legacy = os.environ.get("MODELS_DIR", "").strip()
    if not env_roots and legacy:
        env_roots = [legacy]
    if env_roots:
        roots = [os.path.abspath(os.path.expanduser(p)) for p in env_roots]
        # "/" имеет наивысший приоритет: полный доступ к ФС по запросу пользователя
        if any(r == "/" for r in roots):
            return ["/"]
        return roots
    candidates = [os.path.abspath(os.path.expanduser(p)) for p in _DEFAULT_MODEL_ROOTS]
    # реальные места моделей из конфигов — любой диск/раздел, который указал пользователь
    try:
        for conf in glob.glob(os.path.join(INSTANCES_DIR, "*.conf")):
            _, _, _, model_path, _ = parse_conf(conf)
            d = os.path.dirname(model_path) if model_path else ""
            d = os.path.abspath(os.path.expanduser(d)) if d else ""
            if d and d not in candidates:
                candidates.append(d)
    except Exception as e:
        logging.error(f"Ошибка чтения конфигов для корней проводника: {e}")
    existing = [p for p in candidates if os.path.isdir(p)]
    return existing or [candidates[0]]

MODEL_ROOTS = build_model_roots()

LOG_FILE = os.path.join(WEB_PANEL_DIR, "panel_error.log")
try:
    logging.basicConfig(filename=LOG_FILE, level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
except Exception:
    logging.basicConfig(level=logging.INFO)

# --- Локализация (языковые пакеты подгружаются динамически из папки locales) ---
LOCALES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "locales")
DEFAULT_LOCALE = "ru"
LOCALE_NAMES = {  # display names for language menu; unknown codes shown as-is
    "ru": "Русский",
    "en": "English",
    "tr": "Türkçe",
    "zh_CN": "中文(简体)",
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

# --- Ленивый файловый браузер (Вариант А) ---
# Разрешены только пути внутри MODEL_ROOTS (whitelist). Скан всей папки не нужен —
# содержимое директории отдаётся по запросу, навигация возможна в пределах whitelist.
MAX_BROWSE_DEPTH = 8      # глубина от корня whitelist
MAX_FILES_PER_DIR = 500   # максимум .gguf-файлов на одну директорию

def get_roots():
    """Список корневых папок проводника моделей.

    В отличие от старой версии, НЕ молча выбрасывает отсутствующие директории:
    пользователь явно настроил корень через LLAMA_MODELS_DIRS — он и так не сможет
    выйти за whitelist, поэтому путь остаётся в списке с флагом exists=False
    (UI подскажет, что папка пока не найдена). Если не существует ни один корень —
    добавляется стандартный кандидат ~/models, чтобы проводник не был пустым.
    Корень "/" означает полный доступ к файловой системе (см. build_model_roots).

    ВАЖНО: пути отдаются как os.path.abspath (без realpath), иначе на системах,
    где /stor — это смонтированный раздел (/data/stor), UI получал «разрешённый»
    путь /data/stor/... вместо привычного /stor/..., а навигация вверх ломалась.
    Проверка whitelist (is_under_roots) — по нормализованным путям, симлинки
    наружу из корня отсекаются отдельно (_is_external_symlink).
    """
    if MODEL_ROOTS == ["/"]:
        return [{"path": "/", "exists": True}]
    roots = []
    for r in MODEL_ROOTS:
        p = os.path.normpath(r)
        if p not in [x["path"] for x in roots]:
            roots.append({"path": p, "exists": os.path.isdir(p)})
    if not any(x["exists"] for x in roots):
        home_models = os.path.abspath(os.path.expanduser("~/models"))
        if home_models not in [x["path"] for x in roots]:
            roots.append({"path": home_models, "exists": os.path.isdir(home_models)})
    return roots

def _root_paths():
    return [x["path"] for x in get_roots()]

def is_under_roots(path):
    """Проверка, что path находится внутри одного из разрешённых корней.

    Сравнение идёт по нормализованным путям (abspath), а не realpath: иначе на
    системах, где папка моделей лежит на смонтированном разделе (symlink /stor ->
    /data/stor или mount-bind), весь whitelist «испарялся» и проводник отдавал 403.
    Защита от выхода за пределы корня сохраняется: '..' схлопывается normpath'ом,
    поэтому /root/../etc не пройдёт проверку. Симлинки наружу из корня отсекаются
    отдельно при выдаче файлов (проверка realpath для самих .gguf).
    """
    try:
        norm = os.path.normpath(os.path.abspath(path))
    except Exception:
        return False
    root_paths = _root_paths()
    if root_paths == ["/"]:      # полный доступ к ФС — разрешено всё
        return True
    for root in root_paths:
        try:
            common = os.path.commonpath([root, norm])
        except ValueError:
            common = None
        if common == root:
            return True
    return False

def _is_external_symlink(filepath):
    """True, если файл является симлинком, ведущим за пределы разрешённых корней."""
    try:
        if not os.path.islink(filepath):
            return False
        real = os.path.realpath(filepath)
        root_paths = _root_paths()
        if root_paths == ["/"]:
            return False
        for root in root_paths:
            try:
                if os.path.commonpath([root, real]) == root:
                    return False
            except ValueError:
                continue
        return True
    except Exception:
        return False

def human_size(nbytes):
    gb = nbytes / (1024 ** 3)
    if gb >= 1:
        return f"{round(gb, 2)} GB"
    return f"{max(1, round(nbytes / (1024 ** 2)))} MB"

@app.route('/api/browse/roots')
def browse_roots():
    return jsonify({"roots": get_roots()})

@app.route('/api/browse')
def browse_dir():
    lang = get_locale()
    rel = request.args.get('path', '') or ''
    roots = _root_paths()
    full_access = roots == ["/"]      # "/" = разрешена вся файловая система
    if os.path.isabs(rel):
        target = os.path.abspath(rel)
    else:
        base = roots[0] if roots else '/'
        target = os.path.abspath(os.path.join(base, rel.lstrip('/')))
    if not is_under_roots(target):
        return err("err_path_forbidden", 403, lang=lang)
    if not os.path.isdir(target):
        return err("err_path_not_found", 404, lang=lang)

    depth = 0
    inside_root = ""
    for root in roots:
        try:
            if os.path.commonpath([root, target]) == root:
                inside_root = root
        except ValueError:
            continue
        if full_access:
            # корень "/": глубина не ограничена, вверх можно до самой /
            break
        rel_to_root = os.path.relpath(target, root)
        depth = 0 if rel_to_root == '.' else rel_to_root.count(os.sep) + 1
        break
    if not inside_root and not full_access:
        # путь симлинком уходит из разрешённой папки (например /stor/models ->
        # /data/stor/models): остаёмся «внутри» корня по логическому пути, но
        # дальше пускаем только симлинки наружу — см. _is_external_symlink ниже
        real_target = os.path.realpath(target)
        for root in roots:
            try:
                if os.path.commonpath([os.path.realpath(root), real_target]) == os.path.realpath(root):
                    inside_root = root
                    break
            except ValueError:
                continue
    truncated = False
    folders, files = [], []
    allow_escape_links = bool(inside_root)   # whitelist-корень через симлинк/маунт
    try:
        with os.scandir(target) as it:
            entries = sorted(it, key=lambda e: e.name.lower())
    except PermissionError:
        return err("err_path_denied", 403, lang=lang)
    except Exception as e:
        logging.error(f"Ошибка чтения директории {target}: {e}")
        return err("err_generic", 500, lang=lang)

    for entry in entries:
        try:
            if entry.is_dir(follow_symlinks=False) or (entry.is_symlink() and os.path.isdir(entry.path)):
                if not full_access and depth + 1 > MAX_BROWSE_DEPTH:
                    continue
                folders.append({"name": entry.name, "path": os.path.join(target, entry.name)})
            elif entry.name.lower().endswith('.gguf') and entry.is_file(follow_symlinks=True):
                if len(files) >= MAX_FILES_PER_DIR:
                    truncated = True
                    continue
                full = os.path.join(target, entry.name)
                if _is_external_symlink(full):   # симлинк наружу из разрешённых папок — пропускаем
                    continue
                files.append({
                    "name": entry.name,
                    "path": full,
                    "size_gb": round(os.path.getsize(full) / (1024 ** 3), 2),
                    "size_human": human_size(os.path.getsize(full)),
                })
        except Exception:
            continue

    parent = os.path.dirname(target)
    # «вверх»: при корне "/" — до самой /.; иначе — пока родитель не выше корня whitelist.
    if full_access:
        can_go_up = target != "/"      # на самой / родителем является она сама — стоп
        parent = parent if can_go_up else ""
    else:
        # Сравнение — нормализованными СТРОКАМИ (без realpath): на системах, где
        # папка моделей лежит на смонтированном разделе или за симлинком
        # (/stor -> /data/stor), realpath родителя («/data/stor/models») не
        # совпадает с логическим корнем whitelist («/stor/models»), из-за чего
        # кнопка «вверх» исчезала уже в самом корне и выйти было некуда.
        # Безопасность не снижается: parent остаётся строго внутри корня
        # whitelist (выше корня — stop); наружу всё равно не выпускает
        # is_under_roots() при следующем запросе.
        def _norm(p):
            return os.path.normpath(os.path.abspath(p)).rstrip('/') or '/'
        n_target = _norm(target)
        n_root = _norm(inside_root)
        n_parent = _norm(parent)
        # «вверх» можно, пока текущая папка глубже корня whitelist;
        # на самом корне (n_target == n_root) — стоп (at_root=True).
        can_go_up = bool(inside_root) and n_target != n_root and \
                    (n_root == '/' or n_target.startswith(n_root + '/'))
        parent = n_parent if can_go_up else ""
    return jsonify({
        "cwd": target,
        "root": inside_root,
        "parent": parent if can_go_up else None,
        "at_root": not can_go_up,
        "folders": folders,
        "files": files,
        "truncated": truncated,
    })

def list_all_models():
    """Полный обход всех whitelist-корней (для старого API /api/models и проверки пути модели)."""
    models_list = []
    for root in _root_paths():
        try:
            for dirpath, dirs, filenames in os.walk(root):
                if dirpath[len(root):].count(os.sep) > MAX_BROWSE_DEPTH:
                    dirs[:] = []
                    continue
                for fname in filenames:
                    if fname.lower().endswith('.gguf'):
                        full_path = os.path.join(dirpath, fname)
                        if not is_under_roots(full_path):
                            continue
                        try:
                            size = os.path.getsize(full_path)
                        except OSError:
                            continue
                        models_list.append({
                            "name": fname, "path": full_path,
                            "rel_path": os.path.relpath(full_path, root),
                            "size_gb": round(size / (1024 ** 3), 2),
                            "size_human": human_size(size),
                        })
        except Exception as e:
            logging.error(f"Ошибка сканирования {root}: {e}")
    models_list.sort(key=lambda x: x['rel_path'])
    return models_list

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

# --- Локализация строк статуса из manager.sh («⚪ СТАТУС: STOPPED (сессия не найдена)») ---
STATUS_KIND_KEYS = {  # token in manager.sh output -> locale key of the label
    "RUNNING": "status_running",
    "LOADING": "status_loading",
    "STOPPED": "status_stopped",
    "ERROR":   "status_error",
}
STATUS_DETAIL_KEYS = [  # fragment of manager.sh status output -> (locale key, position of port in it)
    ("сессия не найдена",     "status_detail_session_not_found", None),
    ("no server running",     "status_detail_session_not_found", None),
    ("session not found",     "status_detail_session_not_found", None),
    ("/health ok",            "status_detail_port_health",       1),
    ("модель еще не готова",  "status_detail_port_loading",      1),
    ("модель ещё не готова",  "status_detail_port_loading",      1),
    ("model is not ready",    "status_detail_port_loading",      2),
    ("не слушается",         "status_detail_port_down",         5),
    ("is not listening",      "status_detail_port_down",         4),
]
ICON_BY_KIND = {"running": "🟢 ", "loading": "🟡 ", "stopped": "⚪ ", "error": "🔴 "}

def localize_status(raw, name, lang):
    """Возвращает локализованную строку статуса вида «🟢 РАБОТАЕТ (порт 8081, /health OK)».
    Понимает и русские, и английские выходные данные manager.sh; порт всегда берётся из конфига."""
    raw = (raw or "").strip()
    kind = next((k for k in STATUS_KIND_KEYS if re.search(k, raw)), None)
    if not kind:
        return raw
    low = raw.lower()
    detail_key, port_idx = None, None
    for frag, key, idx in STATUS_DETAIL_KEYS:
        if frag in low:
            detail_key, port_idx = key, idx
            break
    port = "?"
    conf_path = os.path.join(INSTANCES_DIR, f"{name}.conf")
    if os.path.exists(conf_path):
        p, _, _, _, _ = parse_conf(conf_path)
        port = p
    label = tr(STATUS_KIND_KEYS[kind], lang)
    detail = ""
    if detail_key:
        detail = tr(detail_key, lang, port=port)
        if port_idx is None:  # русские фразы manager.sh без подстановки порта — добавим порт сами
            m = re.search(r'(\d{4,5})', raw)
            if m and 'порт' in detail:
                detail = detail.replace('порт', f"порт {m.group(1)}", 1)
    icon = ICON_BY_KIND.get(kind.lower(), "")
    return f"{icon}{label} ({detail})" if detail else f"{icon}{label}"

@app.route('/api/status/<name>', methods=['GET'])
def get_status(name):
    if not is_valid_name(name): return err("err_invalid_name")
    lang = get_locale()
    try:
        result = subprocess.run([MANAGER_SH, name, "status"], capture_output=True, text=True, timeout=5)
        return jsonify({"status": localize_status(result.stdout.strip(), name, lang)})
    except Exception as e:
        return jsonify({"status": localize_status("ERROR session not found", name, lang)})

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
    """Совместимость со старым API: полный рекурсивный обход whitelist-корней."""
    return jsonify(list_all_models())

@app.route('/api/models/refresh', methods=['POST'])
def refresh_models():
    """Ленивому браузеру кэш не нужен — актуальный список корней всегда отдаётся напрямую."""
    return jsonify({"status": "OK", "roots": get_roots()})

if __name__ == '__main__':
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
