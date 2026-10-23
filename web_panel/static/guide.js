let cachedGuideMarkdown = null;

async function openGuide() {
    // Закрываем меню настроек, если оно открыто
    if (typeof closeSettingsMenu === 'function') closeSettingsMenu();
    
    const guideBody = document.getElementById('guide-body');
    const modal = document.getElementById('guideModal');
    if (!guideBody || !modal) return;
    
    modal.classList.add('active');
    
    // Если руководство уже загружалось ранее — рендерим из кэша мгновенно
    if (cachedGuideMarkdown) {
        guideBody.innerHTML = marked.parse(cachedGuideMarkdown);
        return;
    }
    
    guideBody.innerHTML = `<p style="text-align:center; color:var(--text-muted);">${typeof t === 'function' ? t('explorer_loading') : 'Загрузка руководства...'}</p>`;
    
    try {
        const res = await fetch('/api/guide');
        if (res.ok) {
            cachedGuideMarkdown = await res.text();
            guideBody.innerHTML = marked.parse(cachedGuideMarkdown);
        } else {
            guideBody.innerHTML = `<p style="color: var(--danger);">Ошибка загрузки руководства (404). Проверьте наличие README.md в корне проекта.</p>`;
        }
    } catch (e) {
        guideBody.innerHTML = `<p style="color: var(--danger);">Ошибка сети при загрузке руководства.</p>`;
    }
}

function closeGuide() {
    const modal = document.getElementById('guideModal');
    if (modal) modal.classList.remove('active');
}