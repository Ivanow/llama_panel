#!/bin/bash

echo "======================================"
echo "🗑️  Удаление LlamaPanel"
echo "======================================"

read -p "Вы уверены, что хотите удалить LlamaPanel? (y/N): " confirm
if [[ $confirm != [yY] ]]; then
    echo "Отменено."
    exit 0
fi

# Остановка всех запущенных инстансов
echo "🛑 Остановка всех запущенных инстансов..."
for conf in instances/*.conf; do
    if [ -f "$conf" ]; then
        name=$(basename "$conf" .conf)
        ./manager.sh "$name" stop 2>/dev/null || true
    fi
done

# Удаление скомпилированных файлов
echo "🧹 Удаление скомпилированных файлов..."
rm -rf build/
rm -rf llama.cpp/

# Удаление виртуального окружения
echo "🧹 Удаление виртуального окружения Python..."
rm -rf venv/

# Удаление кэша моделей
echo "🧹 Удаление кэша моделей..."
rm -f web_panel/models_cache.json

echo "======================================"
echo "✅ LlamaPanel удален."
echo ""
echo "⚠️  Конфигурации инстансов (instances/) и логи (logs/) сохранены."
echo "Для полного удаления выполните:"
echo "   rm -rf instances/ logs/"
echo "======================================"