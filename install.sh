#!/bin/bash
set -e # Останавливаем скрипт при любой ошибке

echo "======================================"
echo "🦙 Установка LlamaPanel"
echo "======================================"

# 1. Проверка зависимостей
echo "[1/4] Проверка зависимостей..."
for cmd in git cmake tmux curl; do
    if ! command -v $cmd &> /dev/null; then
        echo "❌ Ошибка: $cmd не установлен. Установите его (например, sudo apt install $cmd) и попробуйте снова."
        exit 1
    fi
done

CUDA_FLAG=""
if command -v nvcc &> /dev/null; then
    echo "✅ CUDA найдена. Сборка с поддержкой GPU."
    CUDA_FLAG="-DGGML_CUDA=ON"
else
    echo "⚠️ CUDA не найдена. Сборка ТОЛЬКО на CPU."
fi

# 2. Клонирование llama.cpp
echo "[2/4] Клонирование исходников llama.cpp..."
if [ ! -d "llama.cpp" ]; then
    git clone https://github.com/ggml-org/llama.cpp.git
else
    echo "Папка llama.cpp уже существует. Пропускаем клонирование."
fi

# 3. Компиляция
echo "[3/4] Компиляция llama.cpp (это может занять 10-20 минут в зависимости от CPU)..."
cd llama.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release $CUDA_FLAG
cmake --build build --config Release -j $(nproc)
cd ..

# 4. Подготовка файлов
echo "[4/4] Копирование бинарников..."
mkdir -p build/bin
cp llama.cpp/build/bin/llama-server build/bin/
# Копируем динамические библиотеки, если они есть (нужно для некоторых сборок)
cp llama.cpp/build/bin/*.so build/bin/ 2>/dev/null || true
chmod +x build/bin/llama-server
chmod +x manager.sh

echo "======================================"
echo "✅ Установка успешно завершена!"
echo "Запустите панель командой: python3 web_panel/app.py"
echo "======================================"
