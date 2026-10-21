setInterval(updateAllStatuses, 10000);
let currentEditMode = false;

/* ==================== ЛОКАЛИЗАЦИЯ (i18n) ==================== */
let I18N = {};          // текущий языковой пакет (ключ -> строка)
let I18N_LANG = 'ru';   // текущий язык
let I18N_AVAILABLE = {};// доступные языки: {код: отображаемое имя} — приходит с сервера

function t(key, vars) {
    let s = I18N[key];
    if (s === undefined) s = key;
    if (vars) Object.keys(vars).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
}

async function loadI18n() {
    try {
        const res = await fetch('/api/i18n');
        const data = await res.json();
        I18N_LANG = data.lang;
        I18N_AVAILABLE = data.available || {};
        I18N = data.strings || {};
        applyStaticTranslations();
        renderLangList();
    } catch (e) { console.error('i18n load error:', e); }
}

// Перевод всех элементов с data-i18n / data-i18n-title / data-i18n-placeholder
function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.documentElement.lang = I18N_LANG;
    const cl = document.getElementById('current-lang');
    if (cl) cl.innerText = I18N_AVAILABLE[I18N_LANG] || I18N_LANG;
    updateDraftWarning();
}

// Языковой список строится САМ из тех пакетов, что нашлись на сервере (/api/i18n)
function renderLangList() {
    const list = document.getElementById('lang-list');
    if (!list) return;
    list.innerHTML = '';
    Object.keys(I18N_AVAILABLE).sort().forEach(code => {
        const item = document.createElement('div');
        item.className = 'lang-option' + (code === I18N_LANG ? ' active' : '');
        item.innerHTML = '<span class="lang-check">' + (code === I18N_LANG ? '✓' : '') + '</span>' +
                         '<span>' + I18N_AVAILABLE[code] + '</span>';
        item.onclick = (ev) => { ev.stopPropagation(); setLanguage(code); };
        list.appendChild(item);
    });
}

function setLanguage(code) {
    document.cookie = 'lang=' + encodeURIComponent(code) + ';path=/;max-age=31536000;samesite=Lax';
    location.reload();
}

// Перевод сырых системных сообщений (tmux и пр.), если они попадают в интерфейс
const RAW_MSG_KEYS = [
    [/СТАТУС:/g, null],            // префикс manager.sh — убираем (метка статуса уже локализована)
    [/STATUS:/g, null],
    [/session not found/i, 'status_detail_session_not_found'],
    [/no sessions/i, 'status_detail_session_not_found'],
    [/can't attach[^.]*/i, 'err_tmux_attach'],
];
function trRaw(s) {
    if (!s) return s;
    for (const [re, key] of RAW_MSG_KEYS) {
        if (re.test(s)) s = s.replace(re, key === null ? '' : t(key));
    }
    return s;
}

/* ==================== МЕНЮ ШЕСТЕРЁНКИ ==================== */
function toggleSettingsMenu(ev) {
    ev.stopPropagation();
    const menu = document.getElementById('settings-menu');
    const btn = document.getElementById('btn-settings');
    const willOpen = !menu.classList.contains('open');
    menu.classList.toggle('open', willOpen);
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (!willOpen) document.getElementById('lang-list').classList.remove('open');
}

function toggleLangList(ev) {
    ev.stopPropagation();
    document.getElementById('lang-list').classList.toggle('open');
}

function closeSettingsMenu() {
    const menu = document.getElementById('settings-menu');
    menu.classList.remove('open');
    document.getElementById('lang-list').classList.remove('open');
    document.getElementById('btn-settings').setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', () => closeSettingsMenu());

/* ==================== РУКОВОДСТВО ==================== */
function openGuide() {
    closeSettingsMenu();
    document.getElementById('guide-body').innerHTML = t('guide_html');
    document.getElementById('guideModal').classList.add('active');
}
function closeGuide() {
    document.getElementById('guideModal').classList.remove('active');
}

/* ==================== КАРТОЧКИ ИНСТАНСОВ ==================== */
async function loadInstances() {
    const grid = document.getElementById('instances-grid');
    try {
        const response = await fetch('/api/instances');
        const instances = await response.json();
        grid.innerHTML = '';
        if (instances.length === 0) { grid.innerHTML = '<p>' + t('no_servers') + '</p>'; return; }

        instances.forEach(inst => {
            const card = document.createElement('div');
            card.className = 'card' + (inst.can_start === false ? ' disabled' : '');
            card.id = 'card-' + inst.name;

            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title" id="title-${inst.name}">${inst.name}</span>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span class="status-dot" id="dot-${inst.name}"></span>
                        <button onclick="editInstance('${inst.name}')" style="padding: 4px; background: transparent; border: none; cursor: pointer; color: var(--text-muted);" title="${t('title_edit')}">
                            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button onclick="deleteInstance('${inst.name}')" style="padding: 4px; background: transparent; border: none; cursor: pointer; color: var(--text-muted);" title="${t('title_delete')}">
                            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
                <div class="info">${t('card_port')}: <span>${inst.port}</span><br>${t('card_model')}: <span style="font-size:12px;" title="${inst.model}">${inst.model.substring(0, 30)}...</span></div>
                <div class="status-text" id="status-${inst.name}" style="font-size: 12px; color: var(--text-muted); margin-top: 5px;">
                    ${inst.can_start === false ? inst.reason : t('checking')}
                </div>
                <div class="loader-bar" id="loader-${inst.name}"><div class="loader-fill"></div></div>
                <div class="controls">
                    <button class="btn-primary" onclick="doAction('${inst.name}', 'start', this)" ${inst.can_start === false ? 'disabled' : ''}>${t('btn_start')}</button>
                    <button class="btn-danger" onclick="doAction('${inst.name}', 'stop', this)">${t('btn_stop')}</button>
                    <button onclick="doAction('${inst.name}', 'restart', this)">${t('btn_restart')}</button>
                </div>
            `;
            grid.appendChild(card);
        });
        updateAllStatuses();
    } catch (e) { grid.innerHTML = '<p style="color: red;">' + t('error_prefix') + ': ' + e + '</p>'; }
}

async function updateAllStatuses() {
    const cards = document.querySelectorAll('.card');
    for (const card of cards) {
        const name = card.id.replace('card-', '');
        if (document.getElementById('loader-' + name).classList.contains('active')) continue;
        try {
            const res = await fetch('/api/status/' + name);
            const data = await res.json();
            const statusStr = data.status;
            const dot = document.getElementById('dot-' + name);
            const title = document.getElementById('title-' + name);
            const btnStart = card.querySelectorAll('.controls button')[0];
            const btnStop = card.querySelectorAll('.controls button')[1];
            const btnRestart = card.querySelectorAll('.controls button')[2];
            const statusText = document.getElementById('status-' + name);

            if (statusStr.includes('RUNNING')) {
                dot.className = 'status-dot online'; title.className = 'card-title title-online';
                card.classList.remove('disabled');
                btnStart.disabled = true; btnStop.disabled = false; btnRestart.disabled = false;
                statusText.innerText = trRaw(statusStr);
            } else if (statusStr.includes('LOADING')) {
                dot.className = 'status-dot loading'; title.className = 'card-title title-loading';
                btnStart.disabled = true; btnStop.disabled = true; btnRestart.disabled = true;
                statusText.innerText = trRaw(statusStr);
            } else {
                dot.className = 'status-dot offline'; title.className = 'card-title title-offline';
                btnStop.disabled = true; btnRestart.disabled = true;
                if (statusText.innerText === t('checking')) statusText.innerText = trRaw(statusStr);
            }
        } catch(e) { console.error(e); }
    }
}

async function doAction(name, action, btn) {
    const card = document.getElementById('card-' + name);
    card.querySelectorAll('.controls button').forEach(b => b.disabled = true);
    const loader = document.getElementById('loader-' + name);
    if (action === 'start' || action === 'restart') loader.classList.add('active');

    try {
        await fetch('/api/action/' + name + '/' + action, { method: 'POST' });
    }
    catch(e) { alert(t('error_prefix') + ': ' + e); }
    finally {
        loader.classList.remove('active');
        if (action === 'stop') {
            setTimeout(loadInstances, 2000);
        } else {
            updateAllStatuses();
        }
    }
}

async function refreshModels() {
    const btn = document.getElementById('btn-refresh-models');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = t('alert_scan');

    try {
        const res = await fetch('/api/models/refresh', { method: 'POST' });
        if (res.ok) {
            allModels = []; // Сбрасываем локальный кэш
            alert(t('alert_models_updated'));
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || t('alert_scan_failed'));
        }
    } catch (e) {
        alert(t('network_error') + ': ' + e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        applyStaticTranslations();
    }
}

async function deleteInstance(name) {
    if (!confirm(t('confirm_delete', { name: name }))) return;
    try {
        const res = await fetch(`/api/instances/${name}/delete`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            loadInstances();
        } else {
            alert('⛔ ' + trRaw(data.error));
        }
    } catch (e) { alert(t('network_error') + ': ' + e); }
}

async function editInstance(name) {
    try {
        const res = await fetch('/api/instances');
        const instances = await res.json();
        const inst = instances.find(i => i.name === name);
        if (!inst) return alert(t('err_config_not_found'));
        if (inst.is_running) return alert(t('alert_not_running_edit'));

        currentEditMode = true;
        document.getElementById('modal-title').innerText = t('modal_edit_instance', { name: name });
        document.getElementById('btn-submit').innerText = t('btn_save_changes');

        document.getElementById('new-name').value = inst.name;
        document.getElementById('new-name').disabled = true;
        document.getElementById('new-port').value = inst.port;
        document.getElementById('new-args').value = inst.args;

        const modelRes = await fetch('/api/models');
        const models = await modelRes.json();
        const modelObj = models.find(m => m.name === inst.model);
        if (modelObj) document.getElementById('new-model').value = modelObj.path;
        else document.getElementById('new-model').value = inst.model;

        document.getElementById('addModal').classList.add('active');
        onModeChange();
        document.getElementById('new-args').value = inst.args;

    } catch(e) { alert(t('error_prefix') + ': ' + e); }
}

function openModal() {
    currentEditMode = false;
    document.getElementById('modal-title').innerText = t('modal_new_instance');
    document.getElementById('btn-submit').innerText = t('btn_create_config');
    document.getElementById('new-name').disabled = false;
    document.getElementById('addForm').reset();
    document.getElementById('new-port').value = 8081;
    document.getElementById('addModal').classList.add('active');
    onModeChange();
}

function closeModal() {
    document.getElementById('addModal').classList.remove('active');
    document.getElementById('args-builder').style.display = 'none';
}

async function saveInstance(event) {
    event.preventDefault();
    const name = document.getElementById('new-name').value;
    const port = document.getElementById('new-port').value;
    const model = document.getElementById('new-model').value;
    const args = document.getElementById('new-args').value;

    const submitBtn = document.getElementById('btn-submit');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = t('saving');
    submitBtn.disabled = true;

    const url = currentEditMode ? `/api/instances/${name}/update` : '/api/instances/create';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, port, model, args })
        });
        const result = await response.json();

        if (response.ok) {
            closeModal();
            loadInstances();
        } else {
            alert('❌ ' + t('error_prefix') + ': ' + trRaw(result.error));
        }
    } catch (e) { alert(t('network_error') + ': ' + e); }
    finally { submitBtn.innerText = originalText; submitBtn.disabled = false; }
}

/* ==================== ПРОВОДНИК МОДЕЛЕЙ (ленивый браузер) ==================== */
let explorerTarget = 'main';
let browseRoots = [];      // корневые папки из /api/browse/roots
let browseCwd = '';        // текущая абсолютная директория
let browseData = null;     // ответ /api/browse для текущей директории

async function fetchBrowse(path) {
    const res = await fetch('/api/browse?path=' + encodeURIComponent(path));
    if (!res.ok) {
        let msg = t('err_generic');
        try { const d = await res.json(); msg = d.error || msg; } catch(e) {}
        throw new Error(msg);
    }
    return res.json();
}

async function openExplorer(target) {
    explorerTarget = target;
    document.getElementById('explorerModal').classList.add('active');
    document.getElementById('model-search').value = '';
    const list = document.getElementById('model-list');
    list.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">' + t('explorer_loading') + '</div>';
    try {
        if (browseRoots.length === 0) {
            const r = await fetch('/api/browse/roots');
            const d = await r.json();
            browseRoots = d.roots || [];
        }
        if (browseRoots.length === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">' + t('explorer_no_roots') + '</div>';
            return;
        }
        await loadFolder(browseRoots[0]);
    } catch (e) {
        list.innerHTML = '<div style="padding:20px; color:red;">' + (e.message || t('err_generic')) + '</div>';
    }
}

async function loadFolder(path) {
    const list = document.getElementById('model-list');
    list.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">' + t('explorer_loading') + '</div>';
    try {
        browseData = await fetchBrowse(path);
        browseCwd = browseData.cwd;
        renderExplorer();
    } catch (e) {
        list.innerHTML = '<div style="padding:20px; color:red;">' + (e.message || t('err_generic')) + '</div>';
    }
}

function closeExplorer() {
    document.getElementById('explorerModal').classList.remove('active');
    document.getElementById('model-search').value = '';
}

function toggleArgsBuilder() {
    const b = document.getElementById('args-builder');
    b.style.display = b.style.display === 'block' ? 'none' : 'block';
}
function onArgChange() { buildArgs(); }

function onModeChange() {
    const mode = document.getElementById('run-mode').value;
    const groups = ['group-generation', 'group-embedding', 'group-reranking', 'group-vision', 'group-draft', 'group-reasoning'];
    groups.forEach(id => document.getElementById(id).style.display = 'none');

    document.getElementById('arg-flash').checked = false;
    document.getElementById('arg-jinja').checked = false;

    if (mode === 'chat') {
        document.getElementById('arg-ctx').value = "8192";
        document.getElementById('group-generation').style.display = 'grid';
        document.getElementById('group-vision').style.display = 'grid';
        document.getElementById('group-draft').style.display = 'grid';
        document.getElementById('group-reasoning').style.display = 'grid';
        document.getElementById('arg-flash').checked = true;
        document.getElementById('arg-jinja').checked = true;
    } else if (mode === 'coder') {
        document.getElementById('arg-ctx').value = "16384";
        document.getElementById('group-generation').style.display = 'grid';
        document.getElementById('group-reasoning').style.display = 'grid';
        document.getElementById('group-draft').style.display = 'grid';
        document.getElementById('arg-flash').checked = true;
        document.getElementById('arg-jinja').checked = true;
    } else if (mode === 'vision') {
        document.getElementById('arg-ctx').value = "4096";
        document.getElementById('group-generation').style.display = 'grid';
        document.getElementById('group-vision').style.display = 'grid';
        document.getElementById('arg-flash').checked = true;
        document.getElementById('arg-jinja').checked = true;
    } else if (mode === 'embedding') {
        document.getElementById('arg-ctx').value = "2048";
        document.getElementById('group-embedding').style.display = 'grid';
    } else if (mode === 'rerank') {
        document.getElementById('arg-ctx').value = "512";
        document.getElementById('group-reranking').style.display = 'grid';
    }
    buildArgs();
}

function buildArgs() {
    let args = [];
    const mode = document.getElementById('run-mode').value;
    const gpu = document.getElementById('arg-gpu-layers').value;
    if (gpu !== "") args.push('--n-gpu-layers ' + gpu);
    const threads = document.getElementById('arg-threads').value;
    if (threads !== "") args.push('--threads ' + threads);
    const ctx = document.getElementById('arg-ctx').value;
    if (ctx !== "") args.push('--ctx-size ' + ctx);

    if (mode === 'embedding') {
        args.push('--embedding');
        const pooling = document.getElementById('arg-pooling').value;
        if (pooling) args.push('--pooling ' + pooling);
        document.getElementById('new-args').value = args.join(" ");
        return;
    }
    if (mode === 'rerank') {
        args.push('--reranking');
        args.push('--pooling rank');
        document.getElementById('new-args').value = args.join(" ");
        return;
    }
    if (document.getElementById('arg-flash').checked) {
        args.push('--flash-attn on');
        args.push('--cache-type-k q8_0 --cache-type-v q8_0');
    }
    if (document.getElementById('arg-jinja').checked) args.push('--jinja');

    if (document.getElementById('group-reasoning').style.display !== 'none') {
        const reasoningMode = document.getElementById('arg-reasoning-mode').value;
        if (reasoningMode !== 'auto') args.push('--reasoning ' + reasoningMode);
        const reasoningBudget = document.getElementById('arg-reasoning-budget').value;
        if (reasoningBudget !== "") args.push('--reasoning-budget ' + reasoningBudget);
        const reasoningKwargs = document.getElementById('arg-reasoning-kwargs').value;
        if (reasoningKwargs.trim() !== "") args.push('--chat-template-kwargs \'' + reasoningKwargs.trim() + '\'');
        const reasoningFormat = document.getElementById('arg-reasoning-format').value;
        if (reasoningFormat !== 'auto') args.push('--reasoning-format ' + reasoningFormat);
    }

    if (mode === 'vision' || mode === 'chat') {
        const mmproj = document.getElementById('arg-mmproj').value;
        if (mmproj.trim() !== "") args.push('--mmproj "' + mmproj.trim() + '"');
    }

    const moe = document.getElementById('arg-moe').value;
    if (moe !== "") args.push('--n-cpu-moe ' + moe);

    if (document.getElementById('group-draft').style.display !== 'none') {
        const draftModel = document.getElementById('arg-draft-model').value;
        if (draftModel.trim() !== "") {
            args.push('-md "' + draftModel.trim() + '"');
            args.push('--spec-type draft-simple');
            const draftMax = document.getElementById('arg-draft-max').value;
            if (draftMax !== "") args.push('--draft-max ' + draftMax);
        }
    }
    document.getElementById('new-args').value = args.join(" ");
}

let allModels = [];

// Предупреждение о Draft переводится из языкового пакета
function updateDraftWarning() {
    const el = document.getElementById('draft-warning');
    if (el) el.innerHTML = t('draft_warning');
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderExplorer() {
    const list = document.getElementById('model-list');
    const breadcrumbs = document.getElementById('breadcrumbs');
    const btnUp = document.getElementById('btn-up');
    const query = document.getElementById('model-search').value.toLowerCase();
    if (!browseData) return;

    breadcrumbs.innerHTML = '';

    // Выпадающий список корневых папок (whitelist) — навигация между разными дисками/папками
    const rootSel = document.createElement('select');
    rootSel.className = 'root-select';
    rootSel.title = t('explorer_roots_title');
    browseRoots.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        if (r === browseData.root) opt.selected = true;
        rootSel.appendChild(opt);
    });
    rootSel.onchange = () => loadFolder(rootSel.value);
    breadcrumbs.appendChild(rootSel);

    // Хлебные крошки внутри текущей корневой папки
    const rel = browseData.cwd.startsWith(browseData.root + '/')
        ? browseData.cwd.slice(browseData.root.length + 1) : '';
    const chain = rel ? rel.split('/') : [];
    let acc = browseData.root;
    chain.forEach((part, index) => {
        acc = acc + '/' + part;
        const sep = document.createElement('span');
        sep.className = 'crumb-sep';
        sep.textContent = '/';
        breadcrumbs.appendChild(sep);
        const span = document.createElement('span');
        span.className = 'crumb';
        span.innerText = part;
        const target = acc;
        span.onclick = () => loadFolder(target);
        breadcrumbs.appendChild(span);
    });

    btnUp.style.display = browseData.parent ? 'flex' : 'none';

    const folders = browseData.folders;
    const files = browseData.files;
    list.innerHTML = '';

    if (!query) {
        folders.forEach(folder => {
            const div = document.createElement('div');
            div.className = 'explorer-item folder';
            div.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> <b>' + escapeHtml(folder.name) + '</b></div>';
            div.onclick = () => loadFolder(folder.path);
            list.appendChild(div);
        });
    }
    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query));
    if (filteredFiles.length === 0 && (folders.length === 0 || query)) {
        list.innerHTML += '<div style="padding:20px; text-align:center; color:#888;">' + t('explorer_empty') + '</div>';
    }
    if (browseData.truncated) {
        list.innerHTML += '<div style="padding:10px 20px; text-align:center; color:#c9a227; font-size:13px;">' + t('explorer_truncated') + '</div>';
    }
    filteredFiles.forEach(f => {
        const div = document.createElement('div');
        div.className = 'explorer-item file';
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                <div>
                    <b>${escapeHtml(f.name)}</b>
                    <span class="file-path">${escapeHtml(f.path)}</span>
                </div>
            </div>
            <span class="size">${f.size_human || (f.size_gb + ' GB')}</span>
        `;
        div.onclick = () => {
            if (explorerTarget === 'main') document.getElementById('new-model').value = f.path;
            else if (explorerTarget === 'mmproj') document.getElementById('arg-mmproj').value = f.path;
            else if (explorerTarget === 'draft') document.getElementById('arg-draft-model').value = f.path;
            closeExplorer();
        };
        list.appendChild(div);
    });
}
function goUp() {
    if (browseData && browseData.parent) loadFolder(browseData.parent);
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadI18n();
    loadInstances();
});
