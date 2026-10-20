setInterval(updateAllStatuses, 10000);
let currentEditMode = false;

async function loadInstances() {
    const grid = document.getElementById('instances-grid');
    try {
        const response = await fetch('/api/instances');
        const instances = await response.json();
        grid.innerHTML = '';
        if (instances.length === 0) { grid.innerHTML = '<p>Нет настроенных серверов.</p>'; return; }

        instances.forEach(inst => {
            const card = document.createElement('div');
            card.className = 'card' + (inst.can_start === false ? ' disabled' : '');
            card.id = 'card-' + inst.name;
            
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title" id="title-${inst.name}">${inst.name}</span>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span class="status-dot" id="dot-${inst.name}"></span>
                        <button onclick="editInstance('${inst.name}')" style="padding: 4px; background: transparent; border: none; cursor: pointer; color: var(--text-muted);" title="Редактировать">
                            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button onclick="deleteInstance('${inst.name}')" style="padding: 4px; background: transparent; border: none; cursor: pointer; color: var(--text-muted);" title="Удалить конфиг">
                            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
                <div class="info">Порт: <span>${inst.port}</span><br>Модель: <span style="font-size:12px;" title="${inst.model}">${inst.model.substring(0, 30)}...</span></div>
                <div class="status-text" id="status-${inst.name}" style="font-size: 12px; color: var(--text-muted); margin-top: 5px;">
                    ${inst.can_start === false ? inst.reason : 'Проверка...'}
                </div>
                <div class="loader-bar" id="loader-${inst.name}"><div class="loader-fill"></div></div>
                <div class="controls">
                    <button class="btn-primary" onclick="doAction('${inst.name}', 'start', this)" ${inst.can_start === false ? 'disabled' : ''}>Старт</button>
                    <button class="btn-danger" onclick="doAction('${inst.name}', 'stop', this)">Стоп</button>
                    <button onclick="doAction('${inst.name}', 'restart', this)">Рестарт</button>
                </div>
            `;
            grid.appendChild(card);
        });
        updateAllStatuses();
    } catch (e) { grid.innerHTML = '<p style="color: red;">Ошибка: ' + e + '</p>'; }
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
                statusText.innerText = statusStr;
            } else if (statusStr.includes('LOADING')) {
                dot.className = 'status-dot loading'; title.className = 'card-title title-loading';
                btnStart.disabled = true; btnStop.disabled = true; btnRestart.disabled = true;
                statusText.innerText = statusStr;
            } else {
                dot.className = 'status-dot offline'; title.className = 'card-title title-offline';
                btnStop.disabled = true; btnRestart.disabled = true;
                if (statusText.innerText === 'Проверка...') statusText.innerText = statusStr;
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
    catch(e) { alert('Ошибка: ' + e); } 
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
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Сканирование...';
    
    try {
        const res = await fetch('/api/models/refresh', { method: 'POST' });
        if (res.ok) {
            allModels = []; // Сбрасываем локальный кэш
            alert('✅ Список моделей на сервере обновлен!');
        } else {
            alert('Ошибка при обновлении списка моделей');
        }
    } catch (e) {
        alert('Ошибка сети: ' + e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function deleteInstance(name) {
    if (!confirm(`Вы уверены, что хотите удалить конфиг "${name}"?`)) return;
    try {
        const res = await fetch(`/api/instances/${name}/delete`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            loadInstances();
        } else {
            alert('⛔ ' + data.error);
        }
    } catch (e) { alert('Ошибка сети: ' + e); }
}

async function editInstance(name) {
    try {
        const res = await fetch('/api/instances');
        const instances = await res.json();
        const inst = instances.find(i => i.name === name);
        if (!inst) return alert('Конфиг не найден');
        if (inst.is_running) return alert('⛔ Нельзя редактировать запущенный сервер. Сначала нажмите «Стоп».');

        currentEditMode = true;
        document.getElementById('modal-title').innerText = "Редактирование: " + name;
        document.getElementById('btn-submit').innerText = "💾 Сохранить изменения";
        
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
        
    } catch(e) { alert('Ошибка загрузки данных: ' + e); }
}

function openModal() { 
    currentEditMode = false;
    document.getElementById('modal-title').innerText = "Новый инстанс";
    document.getElementById('btn-submit').innerText = "Создать конфиг";
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
    submitBtn.innerText = "Сохранение...";
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
            alert('❌ Ошибка: ' + result.error);
        }
    } catch (e) { alert('Ошибка сети: ' + e); } 
    finally { submitBtn.innerText = originalText; submitBtn.disabled = false; }
}

let explorerTarget = 'main';
function openExplorer(target) {
    explorerTarget = target;
    document.getElementById('explorerModal').classList.add('active');
    if (allModels.length === 0) {
        document.getElementById('model-list').innerHTML = '<div style="padding:20px; text-align:center; color:#888;">Сканирование...</div>';
        fetch('/api/models')
            .then(res => res.json())
            .then(data => { allModels = data; buildTree(); renderExplorer(); })
            .catch(() => { document.getElementById('model-list').innerHTML = '<div style="padding:20px; color:red;">Ошибка</div>'; });
    } else {
        renderExplorer();
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
let fileTree = {};
let currentPath = [];

function buildTree() {
    fileTree = { files: [], folders: {} };
    allModels.forEach(m => {
        const parts = m.rel_path.split('/');
        let current = fileTree;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current.folders[parts[i]]) current.folders[parts[i]] = { files: [], folders: {} };
            current = current.folders[parts[i]];
        }
        current.files.push(m);
    });
}
function getCurrentFolder() {
    let current = fileTree;
    for (const folder of currentPath) {
        if (current.folders[folder]) current = current.folders[folder];
    }
    return current;
}
function renderExplorer() {
    const list = document.getElementById('model-list');
    const breadcrumbs = document.getElementById('breadcrumbs');
    const btnUp = document.getElementById('btn-up');
    const query = document.getElementById('model-search').value.toLowerCase();
    
    breadcrumbs.innerHTML = '';
    const rootSpan = document.createElement('span');
    rootSpan.innerText = 'Модели';
    rootSpan.onclick = () => { currentPath = []; renderExplorer(); };
    breadcrumbs.appendChild(rootSpan);

    currentPath.forEach((folder, index) => {
        const span = document.createElement('span');
        span.innerText = folder;
        span.onclick = () => { currentPath = currentPath.slice(0, index + 1); renderExplorer(); };
        breadcrumbs.appendChild(span);
    });

    btnUp.style.display = currentPath.length > 0 ? 'flex' : 'none';
    const currentFolder = getCurrentFolder();
    const folders = Object.keys(currentFolder.folders).sort();
    const files = currentFolder.files;
    list.innerHTML = '';

    if (!query) {
        folders.forEach(folderName => {
            const div = document.createElement('div');
            div.className = 'explorer-item folder';
            div.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> <b>' + folderName + '</b></div>';
            div.onclick = () => { currentPath.push(folderName); renderExplorer(); };
            list.appendChild(div);
        });
    }
    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(query) || f.rel_path.toLowerCase().includes(query));
    if (filteredFiles.length === 0 && folders.length === 0) {
        list.innerHTML += '<div style="padding:20px; text-align:center; color:#888;">Пусто</div>';
    }
    filteredFiles.forEach(f => {
        const div = document.createElement('div');
        div.className = 'explorer-item file';
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                <div>
                    <b>${f.name}</b>
                    <span class="file-path">${f.rel_path}</span>
                </div>
            </div>
            <span class="size">${f.size_gb} GB</span>
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
    if (currentPath.length > 0) { currentPath.pop(); renderExplorer(); }
}
document.addEventListener('DOMContentLoaded', loadInstances);
