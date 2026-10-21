#!/bin/bash
set -e

echo "======================================"
echo "🦙 Установка LlamaPanel"
echo "======================================"

# 1. Проверка базовых зависимостей
echo "[1/4] Проверка зависимостей..."
MISSING_DEPS=""
for cmd in git cmake tmux curl; do
    if ! command -v $cmd &> /dev/null; then
        MISSING_DEPS="$MISSING_DEPS $cmd"
    fi
done

# Проверяем python3 и pip
if ! command -v python3 &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS python3"
fi
if ! command -v pip3 &> /dev/null && ! dpkg -s python3-flask &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS python3-flask"
fi

if [ -n "$MISSING_DEPS" ]; then
    echo "⚠️ Не найдены пакеты:$MISSING_DEPS"
    read -p "Установить их сейчас через apt? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo apt update
        sudo apt install -y $MISSING_DEPS
    else
        echo "❌ Установка отменена. Без этих пакетов панель не заработает."
        exit 1
    fi
else
    echo "✅ Все базовые зависимости на месте."
fi

# Проверка CUDA
CUDA_FLAG=""
if command -v nvcc &> /dev/null; then
    echo "✅ CUDA найдена. Сборка с поддержкой GPU."
    CUDA_FLAG="-DGGML_CUDA=ON"
else
    echo "⚠️ CUDA не найдена. Сборка ТОЛЬКО на CPU (будет медленно)."
fi

# 2. Клонирование
echo "[2/4] Клонирование исходников llama.cpp..."
if [ ! -d "llama.cpp" ]; then
    git clone https://github.com/ggml-org/llama.cpp.git
else
    echo "Папка llama.cpp уже существует. Пропускаем."
fi

# 3. Компиляция с защитой от OOM (Out of Memory)
echo "[3/4] Компиляция llama.cpp..."
cd llama.cpp

# Проверяем свободную память (в мегабайтах)
FREE_RAM=$(free -m | awk '/^Mem:/{print $7}')
if [ "$FREE_RAM" -lt 4000 ]; then
    echo "⚠️ Мало оперативной памяти (${FREE_RAM} МБ). Ограничиваем потоки сборки до 2, чтобы не повесить сервер."
    JOBS=2
else
    JOBS=$(nproc)
fi

cmake -B build -DCMAKE_BUILD_TYPE=Release $CUDA_FLAG
cmake --build build --config Release -j $JOBS
cd ..

# 4. Подготовка файлов
echo "[4/4] Копирование бинарников..."
mkdir -p build/bin
cp llama.cpp/build/bin/llama-server build/bin/
cp llama.cpp/build/bin/*.so build/bin/ 2>/dev/null || true
chmod +x build/bin/llama-server
chmod +x manager.sh

echo "======================================"
echo "✅ Установка успешно завершена!"
echo "Запустите панель командой: python3 web_panel/app.py"
echo "======================================"
