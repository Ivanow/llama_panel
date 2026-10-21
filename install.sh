#!/bin/bash
set -e

echo "======================================"
echo "🦙 Установка LlamaPanel"
echo "======================================"

# 1. Автоматическая установка системных зависимостей
echo "[1/5] Проверка и установка системных зависимостей..."
REQUIRED_CMDS="git cmake tmux curl build-essential"
MISSING_CMDS=""

for cmd in $REQUIRED_CMDS; do
    if ! command -v $cmd &> /dev/null; then
        MISSING_CMDS="$MISSING_CMDS $cmd"
    fi
done

if [ -n "$MISSING_CMDS" ]; then
    echo "⚠️  Отсутствуют пакеты:$MISSING_CMDS"
    echo "📦 Устанавливаю через apt..."
    sudo apt update
    sudo apt install -y $MISSING_CMDS
    if [ $? -ne 0 ]; then
        echo "❌ Ошибка установки пакетов. Установите вручную: sudo apt install$MISSING_CMDS"
        exit 1
    fi
    echo "✅ Системные зависимости установлены."
else
    echo "✅ Все системные зависимости уже установлены."
fi

# 2. Создание виртуального окружения Python
echo "[2/5] Создание виртуального окружения Python..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✅ Виртуальное окружение создано."
else
    echo "ℹ️  Виртуальное окружение уже существует."
fi

# Активация venv
source venv/bin/activate

# 3. Установка Python-зависимостей
echo "[3/5] Установка Python-зависимостей..."
pip install --upgrade pip
pip install -r requirements.txt
echo "✅ Python-зависимости установлены."

# 4. Клонирование и компиляция llama.cpp с ограничением ресурсов
echo "[4/5] Компиляция llama.cpp..."
if [ ! -d "llama.cpp" ]; then
    git clone https://github.com/ggml-org/llama.cpp.git
else
    echo "ℹ️  Папка llama.cpp уже существует. Пропускаем клонирование."
fi

cd llama.cpp

# Проверка CUDA
CUDA_FLAG=""
if command -v nvcc &> /dev/null; then
    echo "✅ CUDA найдена. Сборка с поддержкой GPU."
    CUDA_FLAG="-DGGML_CUDA=ON"
else
    echo "⚠️  CUDA не найдена. Сборка ТОЛЬКО на CPU."
fi

# Ограничение потоков компиляции для слабых машин (максимум 2 потока или доступные ядра)
TOTAL_RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM_GB" -lt 4 ]; then
    BUILD_JOBS=2
    echo "⚠️  Мало RAM (${TOTAL_RAM_GB}GB). Ограничиваю компиляцию до $BUILD_JOBS потоков."
else
    BUILD_JOBS=$(nproc)
fi

cmake -B build -DCMAKE_BUILD_TYPE=Release $CUDA_FLAG
cmake --build build --config Release -j $BUILD_JOBS
cd ..

# 5. Подготовка файлов
echo "[5/5] Подготовка файлов..."
mkdir -p build/bin
cp llama.cpp/build/bin/llama-server build/bin/
cp llama.cpp/build/bin/*.so build/bin/ 2>/dev/null || true
chmod +x build/bin/llama-server
chmod +x manager.sh

echo "======================================"
echo "✅ Установка успешно завершена!"
echo ""
echo "📌 Для запуска панели выполните:"
echo "   source venv/bin/activate"
echo "   python3 web_panel/app.py"
echo ""
echo "🌐 Панель будет доступна по адресу: http://localhost:8090"
echo "======================================"