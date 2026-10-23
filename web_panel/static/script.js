setInterval(updateAllStatuses, 10000);
let currentEditMode = false;

/* ==================== ЛОКАЛИЗАЦИЯ (i18n) ==================== */
let I18N = {};
let I18N_LANG = 'ru';
let I18N_AVAILABLE = {};

function t(key, vars) {
    let s = I18N[key] || key;
    if (vars) {
        Object.keys(vars).forEach(v => {
            s = s.split('{' + v + '}').join(vars[v]);
        });
    }
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
    } catch (e) {
        console.error('i18n load error:', e);
    }
}

function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.documentElement.lang = I18N_LANG;
    const cl = document.getElementById('current-lang');
    if (cl) cl.innerText = I18N_AVAILABLE[I18N_LANG] || I18N_LANG;
    updateDraftWarning();
}

function renderLangList() {
    const list = document.getElementById('lang-list');
    if (!list) return;
    
    const fragment = document.createDocumentFragment();
    Object.keys(I18N_AVAILABLE).sort().forEach(code => {
        const item = document.createElement('div');
        item.className = 'lang-option' + (code === I18N_LANG ? ' active' : '');
        item.innerHTML = `<span class="lang-check">${code === I18N_LANG ? '✓' : ''}</span><span>${I18N_AVAILABLE[code]}</span>`;
        item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            setLanguage(code);
        });
        fragment.appendChild(item);
    });
    list.innerHTML = '';
    list.appendChild(fragment);
}

function setLanguage(code) {
    document.cookie = `lang=${encodeURIComponent(code)};path=/;max-age=31536000;samesite=Lax`;
    location.reload();
}

function trRaw(s) {
    if (!s) return s;
    return s.replace(/СТАТУС:|STATUS:/g, '').replace(/session not found/gi, t('status_detail_session_not_found'));
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    if (menu) menu.classList.remove('open');
    const langList = document.getElementById('lang-list');
    if (langList) langList.classList.remove('open');
    const btnSettings = document.getElementById('btn-settings');
    if (btnSettings) btnSettings.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', closeSettingsMenu);

/* ==================== НАСТРОЙКИ И ПРИВЕТСТВИЕ ==================== */
async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        
        document.getElementById('set-models-dir').value = data.needs_onboarding ? data.default_models_dir : data.models_dir;
        document.getElementById('set-llama-bin').value = data.needs_onboarding ? data.detected_binary : data.llama_binary;
        updateBinaryStatus(data.needs_onboarding ? data.detected_binary : data.llama_binary);

        if (data.needs_onboarding) {
            document.getElementById('settings-title').innerText = t('welcome_title');
            document.getElementById('settings-desc').innerText = t('welcome_desc');
            document.getElementById('settingsModal').classList.add('active');
        } else {
            loadInstances();
        }
    } catch (e) {
        console.error("Ошибка загрузки настроек:", e);
    }
}

function openSettings() {
    closeSettingsMenu();
    document.getElementById('settings-title').innerText = t('menu_settings');
    document.getElementById('settings-desc').innerText = "";
    document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function updateBinaryStatus(path) {
    const el = document.getElementById('binary-status');
    if (path && path.trim() !== "") {
        el.style.color = "var(--accent)";
        el.innerText = t('binary_found', { path: path });
    } else {
        el.style.color = "var(--danger)";
        el.innerText = t('binary_not_found');
    }
}

async function rescanBinary(e) {
    const btn = e ? e.currentTarget : document.getElementById('btn-scan');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '⏳...';
    btn.disabled = true;
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        const detected = data.detected_binary || "";
        document.getElementById('set-llama-bin').value = detected;
        updateBinaryStatus(detected);
    } catch (e) { alert(e); } 
    finally { btn.innerHTML = orig; btn.disabled = false; }
}

async function saveSettings() {
    const models_dir = document.getElementById('set-models-dir').value;
    const llama_binary = document.getElementById('set-llama-bin').value;
    
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models_dir, llama_binary })
        });
        if (res.ok) {
            closeSettings();
            loadInstances();
            alert(t('settings_saved'));
        } else {
            alert("Ошибка при сохранении настроек.");
        }
    } catch (e) { alert("Ошибка сети: " + e); }
}

/* ==================== КАРТОЧКИ ИНСТАНСОВ ==================== */
async function loadInstances() {
    const grid = document.getElementById('instances-grid');
    try {
        const response = await fetch('/api/instances');
        const instances = await response.json();
        grid.innerHTML = '';
        if (instances.length === 0) { 
            grid.innerHTML = '<p>' + t('no_servers') + '</p>'; 
            return; 
        }

        const fragment = document.createDocumentFragment();
        instances.forEach(inst => {
            const card = document.createElement('div');
            card.className = 'card' + (inst.can_start === false ? ' disabled' : '');
            card.id = 'card-' + inst.name;
            card.dataset.canStart = inst.can_start !== false; // Запоминаем, можно ли запускать

            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title" id="title-${inst.name}">${escapeHtml(inst.name)}</span>
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
                <div class="info">${t('card_port')}: <span>${inst.port}</span><br>${t('card_model')}: <span style="font-size:12px;" title="${escapeHtml(inst.model)}">${escapeHtml(inst.model.substring(0, 30))}...</span></div>
                <div class="status-text" id="status-${inst.name}" style="font-size: 12px; color: var(--text-muted); margin-top: 5px;">${inst.can_start === false ? escapeHtml(inst.reason) : t('checking')}</div>
                <div class="loader-bar" id="loader-${inst.name}"><div class="loader-fill"></div></div>
                <div class="controls">
                    <button class="btn-primary" onclick="doAction('${inst.name}', 'start', this)" ${inst.can_start === false ? 'disabled' : ''}>${t('btn_start')}</button>
                    <button class="btn-danger" onclick="doAction('${inst.name}', 'stop', this)">${t('btn_stop')}</button>
                    <button onclick="doAction('${inst.name}', 'restart', this)">${t('btn_restart')}</button>
                </div>
            `;
            fragment.appendChild(card);
        });
        grid.appendChild(fragment);
        updateAllStatuses();
    } catch (e) { 
        grid.innerHTML = '<p style="color: red;">' + t('error_prefix') + ': ' + e + '</p>'; 
    }
}

async function updateAllStatuses() {
    const cards = document.querySelectorAll('.card');
    if (cards.length === 0) return;

    try {
        const res = await fetch('/api/statuses');
        if (!res.ok) return;
        const statuses = await res.json();
        
        cards.forEach(card => {
            const name = card.id.replace('card-', '');
            const loader = document.getElementById('loader-' + name);
            if (loader && loader.classList.contains('active')) return;

            const statusStr = statuses[name];
            if (!statusStr) return;

            const dot = document.getElementById('dot-' + name);
            const title = document.getElementById('title-' + name);
            const buttons = card.querySelectorAll('.controls button');
            const headerButtons = card.querySelectorAll('.card-header button');
            const statusText = document.getElementById('status-' + name);
            const canStart = card.dataset.canStart === 'true'; // Читаем наш флаг

            if (!dot || !title || buttons.length < 3) return;

            const isRunning = statusStr.includes('RUNNING') || statusStr.includes('РАБОТАЕТ') || statusStr.includes('🟢');
            const isLoading = statusStr.includes('LOADING') || statusStr.includes('ЗАГРУЗКА') || statusStr.includes('🟡');

            if (isRunning) {
                dot.className = 'status-dot online'; 
                title.className = 'card-title title-online';
                card.classList.remove('disabled');
                buttons[0].disabled = true;
                buttons[1].disabled = false;
                buttons[2].disabled = false;
                if (headerButtons[0]) headerButtons[0].disabled = true; 
                if (headerButtons[1]) headerButtons[1].disabled = true;
                statusText.innerText = trRaw(statusStr);
            } else if (isLoading) {
                dot.className = 'status-dot loading'; 
                title.className = 'card-title title-loading';
                buttons[0].disabled = true; 
                buttons[1].disabled = true; 
                buttons[2].disabled = true;
                if (headerButtons[0]) headerButtons[0].disabled = true; 
                if (headerButtons[1]) headerButtons[1].disabled = true;
                statusText.innerText = trRaw(statusStr);
            } else {
                dot.className = 'status-dot offline'; 
                title.className = 'card-title title-offline';
                // ФИКС: Не включаем кнопку Старт, если не хватает ресурсов
                buttons[0].disabled = !canStart; 
                buttons[1].disabled = true;  
                buttons[2].disabled = true;  
                if (headerButtons[0]) headerButtons[0].disabled = false; 
                if (headerButtons[1]) headerButtons[1].disabled = false; 
                if (statusText.innerText === t('checking')) statusText.innerText = trRaw(statusStr);
            }
        });
    } catch(e) { 
        console.error('Batch status update error:', e); 
    }
}

async function doAction(name, action, btn) {
    const card = document.getElementById('card-' + name);
    if (card) card.querySelectorAll('.controls button').forEach(b => b.disabled = true);
    const loader = document.getElementById('loader-' + name);
    if (loader && (action === 'start' || action === 'restart')) loader.classList.add('active');

    try { 
        await fetch('/api/action/' + name + '/' + action, { method: 'POST' }); 
    } catch(e) { 
        alert(t('error_prefix') + ': ' + e); 
    } finally {
        if (loader) loader.classList.remove('active');
        if (action === 'stop') setTimeout(loadInstances, 2000);
        else updateAllStatuses();
    }
}

/* ==================== ПРОВОДНИК МОДЕЛЕЙ ==================== */
let explorerTarget = 'main';
let browseRoots = [];
let browseData = null;

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
        const first = browseRoots.find(x => x.exists) || browseRoots[0];
        const lastPath = localStorage.getItem('last_browse_path');
        
        if (lastPath) await loadFolder(lastPath).catch(() => loadFolder(first.path));
        else await loadFolder(first.path);
        
    } catch (e) {
        list.innerHTML = '<div style="padding:20px; color:red;">' + (e.message || t('err_generic')) + '</div>';
    }
}

async function loadFolder(path) {
    const list = document.getElementById('model-list');
    list.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">' + t('explorer_loading') + '</div>';
    try {
        browseData = await fetchBrowse(path);
        localStorage.setItem('last_browse_path', browseData.cwd);
        renderExplorer();
    } catch (e) {
        list.innerHTML = '<div style="padding:20px; color:red;">' + (e.message || t('err_generic')) + '</div>';
    }
}

function closeExplorer() {
    document.getElementById('explorerModal').classList.remove('active');
    document.getElementById('model-search').value = '';
}

function renderExplorer() {
    const list = document.getElementById('model-list');
    const breadcrumbs = document.getElementById('breadcrumbs');
    const btnUp = document.getElementById('btn-up');
    const query = document.getElementById('model-search').value.toLowerCase();
    if (!browseData) return;

    breadcrumbs.innerHTML = '';

    const currentPathDiv = document.createElement('div');
    currentPathDiv.style.width = '100%';
    currentPathDiv.style.marginBottom = '10px';
    currentPathDiv.style.fontSize = '13px';
    currentPathDiv.style.color = 'var(--text-muted)';
    currentPathDiv.innerHTML = '<b style="color:var(--text-main);">Текущий путь:</b> ' + escapeHtml(browseData.cwd);
    breadcrumbs.appendChild(currentPathDiv);

    const rootSel = document.createElement('select');
    rootSel.className = 'root-select';
    browseRoots.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.path;
        opt.textContent = r.exists ? r.path : (r.path + ' — ?');
        if (r.path === browseData.root) opt.selected = true;
        rootSel.appendChild(opt);
    });
    rootSel.addEventListener('change', () => loadFolder(rootSel.value));
    breadcrumbs.appendChild(rootSel);

    const rel = browseData.cwd.startsWith(browseData.root + '/') ? browseData.cwd.slice(browseData.root.length + 1) : '';
    const chain = rel ? rel.split('/') : [];
    let acc = browseData.root;
    chain.forEach((part) => {
        acc += '/' + part;
        const sep = document.createElement('span'); sep.className = 'crumb-sep'; sep.textContent = '/'; breadcrumbs.appendChild(sep);
        const span = document.createElement('span'); span.className = 'crumb'; span.innerText = part; 
        span.addEventListener('click', () => loadFolder(acc));
        breadcrumbs.appendChild(span);
    });

    if (explorerTarget === 'settings_models') {
        const selectBtn = document.createElement('button');
        selectBtn.className = 'btn-primary';
        selectBtn.style.marginLeft = '10px';
        selectBtn.innerText = '✅ ' + (I18N_LANG === 'ru' ? 'Выбрать эту папку' : 'Select this folder');
        selectBtn.addEventListener('click', () => {
            document.getElementById('set-models-dir').value = browseData.cwd;
            closeExplorer();
        });
        breadcrumbs.appendChild(selectBtn);
    }

    if (btnUp) btnUp.style.display = browseData.parent ? 'flex' : 'none';
    
    const fragment = document.createDocumentFragment();

    if (!query) {
        browseData.folders.forEach(folder => {
            const div = document.createElement('div');
            div.className = 'explorer-item folder';
            div.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> <b>' + escapeHtml(folder.name) + '</b></div>';
            div.addEventListener('click', () => loadFolder(folder.path));
            fragment.appendChild(div);
        });
    }
    
    if (explorerTarget !== 'settings_models') {
        const filteredFiles = browseData.files.filter(f => f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query));
        if (filteredFiles.length === 0 && browseData.folders.length === 0 && !query) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.cssText = 'padding:20px; text-align:center; color:#888;';
            emptyDiv.innerText = t('explorer_empty');
            fragment.appendChild(emptyDiv);
        }
        filteredFiles.forEach(f => {
            const div = document.createElement('div');
            div.className = 'explorer-item file';
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                    <div><b>${escapeHtml(f.name)}</b><span class="file-path">${escapeHtml(f.path)}</span></div>
                </div>
                <span class="size">${f.size_human}</span>
            `;
            div.addEventListener('click', () => {
                if (explorerTarget === 'main') {
                    document.getElementById('new-model').value = f.path;
                } else if (explorerTarget === 'mmproj') {
                    document.getElementById('arg-mmproj').value = f.path;
                } else if (explorerTarget === 'draft') {
                    document.getElementById('arg-draft-model').value = f.path;
                } else if (explorerTarget === 'settings_binary') {
                    // ФИКС: Добавлена обработка выбора бинарника
                    document.getElementById('set-llama-bin').value = f.path;
                    if (typeof updateBinaryStatus === 'function') {
                        updateBinaryStatus(f.path);
                    }
                }
                closeExplorer();
            });
            fragment.appendChild(div);
        });
    } else {
        if (browseData.folders.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.cssText = 'padding:20px; text-align:center; color:#888;';
            emptyDiv.innerText = t('explorer_empty');
            fragment.appendChild(emptyDiv);
        }
    }
    list.innerHTML = '';
    list.appendChild(fragment);
}

function goUp() {
    if (browseData && browseData.parent) loadFolder(browseData.parent);
}

/* ==================== МОДАЛКА СОЗДАНИЯ СЕРВЕРА ==================== */
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

async function deleteInstance(name) {
    if (!confirm(t('confirm_delete', { name: name }))) return;
    try {
        const res = await fetch(`/api/instances/${name}/delete`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) loadInstances();
        else alert('⛔ ' + trRaw(data.error));
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
        document.getElementById('new-model').value = inst.model_path || inst.model;

        document.getElementById('addModal').classList.add('active');
        onModeChange();
        document.getElementById('new-args').value = inst.args;
    } catch(e) { alert(t('error_prefix') + ': ' + e); }
}

async function saveInstance(event) {
    event.preventDefault();
    const name = document.getElementById('new-name').value;
    const port = document.getElementById('new-port').value;
    const model = document.getElementById('new-model').value;
    const args = document.getElementById('new-args').value;
    const submitBtn = document.getElementById('btn-submit');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = t('saving'); submitBtn.disabled = true;
    const url = currentEditMode ? `/api/instances/${name}/update` : '/api/instances/create';

    try {
        const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, port, model, args })
        });
        const result = await response.json();
        if (response.ok) { closeModal(); loadInstances(); }
        else alert('❌ ' + t('error_prefix') + ': ' + trRaw(result.error));
    } catch (e) { alert(t('network_error') + ': ' + e); }
    finally { submitBtn.innerText = originalText; submitBtn.disabled = false; }
}

/* ==================== КОНСТРУКТОР АРГУМЕНТОВ ==================== */
function toggleArgsBuilder() {
    const b = document.getElementById('args-builder');
    b.style.display = b.style.display === 'block' ? 'none' : 'block';
}
function onArgChange() { buildArgs(); }

function onModeChange() {
    const mode = document.getElementById('run-mode').value;
    const groups = ['group-generation', 'group-embedding', 'group-reranking', 'group-vision', 'group-draft', 'group-reasoning'];
    groups.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    const flash = document.getElementById('arg-flash');
    const jinja = document.getElementById('arg-jinja');
    if (flash) flash.checked = false;
    if (jinja) jinja.checked = false;

    if (mode === 'chat') {
        document.getElementById('arg-ctx').value = "8192";
        document.getElementById('group-generation').style.display = 'grid';
        document.getElementById('group-vision').style.display = 'grid';
        document.getElementById('group-draft').style.display = 'grid';
        document.getElementById('group-reasoning').style.display = 'grid';
        if (flash) flash.checked = true;
        if (jinja) jinja.checked = true;
    } else if (mode === 'coder') {
        document.getElementById('arg-ctx').value = "16384";
        document.getElementById('group-generation').style.display = 'grid';
        document.getElementById('group-reasoning').style.display = 'grid';
        document.getElementById('group-draft').style.display = 'grid';
        if (flash) flash.checked = true;
        if (jinja) jinja.checked = true;
    } else if (mode === 'vision') {
        document.getElementById('arg-ctx').value = "4096";
        document.getElementById('group-generation').style.display = 'grid';
        document.getElementById('group-vision').style.display = 'grid';
        if (flash) flash.checked = true;
        if (jinja) jinja.checked = true;
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
    const flashEl = document.getElementById('arg-flash');
    if (flashEl && flashEl.checked) {
        args.push('--flash-attn on');
        args.push('--cache-type-k q8_0 --cache-type-v q8_0');
    }
    const jinjaEl = document.getElementById('arg-jinja');
    if (jinjaEl && jinjaEl.checked) args.push('--jinja');

    const reasoningGroup = document.getElementById('group-reasoning');
    if (reasoningGroup && reasoningGroup.style.display !== 'none') {
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

    const draftGroup = document.getElementById('group-draft');
    if (draftGroup && draftGroup.style.display !== 'none') {
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

function updateDraftWarning() {
    const el = document.getElementById('draft-warning');
    if (el) el.innerHTML = t('draft_warning');
}

/* ==================== INIT ==================== */
document.addEventListener('DOMContentLoaded', async () => {
    await loadI18n();
    await loadSettings();
});