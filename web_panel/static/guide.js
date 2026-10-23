async function openGuide() {
    // Закрываем меню настроек
    if (typeof closeSettingsMenu === 'function') closeSettingsMenu();
    
    const guideBody = document.getElementById('guide-body');
    guideBody.innerHTML = '<p style="text-align:center; color:#888;">Загрузка руководства...</p>';
    document.getElementById('guideModal').classList.add('active');
    
    try {
        const res = await fetch('/api/guide');
        if (res.ok) {
            const markdown = await res.text();
            // Превращаем Markdown в HTML
            guideBody.innerHTML = marked.parse(markdown);
        } else {
            guideBody.innerHTML = '<p>Ошибка загрузки руководства (404). Проверьте наличие README.md в корне проекта.</p>';
        }
    } catch (e) {
        guideBody.innerHTML = '<p>Ошибка сети при загрузке руководства.</p>';
    }
}

function closeGuide() {
    document.getElementById('guideModal').classList.remove('active');
}
