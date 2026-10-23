#!/bin/bash
cd "$(dirname "$0")"

# ==========================================
# ЛОКАЛИЗАЦИЯ
# ==========================================
if [[ "${LANG,,}" =~ ^ru ]]; then
    MSG_TITLE="🗑️  Удаление LlamaPanel"
    MSG_CONFIRM="Вы уверены, что хотите удалить LlamaPanel? (y/n/д/н): "
    MSG_CANCEL="Отменено."
    MSG_STOPPING="🛑 Остановка всех запущенных серверов..."
    MSG_STOPPED="   Остановлен: "
    MSG_CLEANING="🧹 Удаление конфигураций и системных файлов..."
    MSG_CLEAN_VENV="🧹 Удаление виртуального окружения..."
    MSG_CLEAN_BUILD="🧹 Удаление папки build/ (бинарники)..."
    MSG_CLEAN_LLAMA_PROMPT="Удалить папку llama.cpp (исходники и сборка)? (y/n/д/н): "
    MSG_CLEAN_LLAMA_DOING="🧹 Удаление llama.cpp..."
    MSG_CLEAN_MODELS_PROMPT="⚠️ Удалить папку models/ со всеми скачанными моделями? (y/n/д/н): "
    MSG_CLEAN_MODELS_DOING="🧹 Удаление папки models/..."
    MSG_KEEP_MODELS="ℹ️  Папка models/ сохранена."
    MSG_SUCCESS="✅ LlamaPanel успешно удален."
else
    MSG_TITLE="🗑️  Uninstalling LlamaPanel"
    MSG_CONFIRM="Are you sure you want to uninstall LlamaPanel? (y/n): "
    MSG_CANCEL="Canceled."
    MSG_STOPPING="🛑 Stopping all running servers..."
    MSG_STOPPED="   Stopped: "
    MSG_CLEANING="🧹 Removing configs and system files..."
    MSG_CLEAN_VENV="🧹 Removing virtual environment..."
    MSG_CLEAN_BUILD="🧹 Removing build/ folder (binaries)..."
    MSG_CLEAN_LLAMA_PROMPT="Remove llama.cpp folder (sources and build)? (y/n): "
    MSG_CLEAN_LLAMA_DOING="🧹 Removing llama.cpp..."
    MSG_CLEAN_MODELS_PROMPT="⚠️ Remove models/ folder with all downloaded models? (y/n): "
    MSG_CLEAN_MODELS_DOING="🧹 Removing models/ folder..."
    MSG_KEEP_MODELS="ℹ️  models/ folder kept."
    MSG_SUCCESS="✅ LlamaPanel successfully uninstalled."
fi

# Универсальная функция подтверждения
confirm_action() {
    local reply
    read -p "$1" reply
    [[ $reply =~ ^[YyДд]$ ]]
}

echo "======================================"
echo "$MSG_TITLE"
echo "======================================"

if ! confirm_action "$MSG_CONFIRM"; then
    echo "$MSG_CANCEL"
    exit 0
fi

# 1. Остановка всех запущенных инстансов
echo "$MSG_STOPPING"
shopt -s nullglob
for conf in instances/*.conf; do
    if [ -f "$conf" ]; then
        name=$(basename "$conf" .conf)
        if tmux has-session -t "llama-$name" 2>/dev/null; then
            tmux kill-session -t "llama-$name"
            echo "$MSG_STOPPED$name"
        fi
    fi
done
shopt -u nullglob

# 2. Удаление конфигураций и маркеров
echo "$MSG_CLEANING"
rm -f .deps_ok config.json web_panel/panel_error.log
rm -rf instances/ logs/

# 3. Удаление виртуального окружения
if [ -d "venv" ]; then
    echo "$MSG_CLEAN_VENV"
    rm -rf venv/
fi

# 4. Удаление скомпилированных бинарников
if [ -d "build" ]; then
    echo "$MSG_CLEAN_BUILD"
    rm -rf build/
fi

# 5. Удаление исходников llama.cpp
if [ -d "llama.cpp" ] && confirm_action "$MSG_CLEAN_LLAMA_PROMPT"; then
    echo "$MSG_CLEAN_LLAMA_DOING"
    rm -rf llama.cpp/
fi

# 6. Удаление папки с моделями
if [ -d "models" ]; then
    if confirm_action "$MSG_CLEAN_MODELS_PROMPT"; then
        echo "$MSG_CLEAN_MODELS_DOING"
        rm -rf models/
    else
        echo "$MSG_KEEP_MODELS"
    fi
fi

echo "======================================"
echo "$MSG_SUCCESS"
echo "======================================"