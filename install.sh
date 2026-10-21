#!/bin/bash
set -e

echo "======================================"
echo "🦙 Установка LlamaPanel"
echo "======================================"

# 1. Установка системных зависимостей
echo "[1/4] Проверка и установка системных зависимостей..."
MISSING_DEPS=""
for cmd in git cmake tmux curl; do
    if ! command -v $cmd &> /dev/null; then
        MISSING_DEPS="$MISSING_DEPS $cmd"
    fi
done
if ! command -v python3 &> /dev/null; then MISSING_DEPS="$MISSING_DEPS python3"; fi
if ! dpkg -s python3-venv &> /dev/null; then MISSING_DEPS="$MISSING_DEPS python3-venv"; fi

if [ -n "$MISSING_DEPS" ]; then
    echo "⚠️ Не найдены пакеты:$MISSING_DEPS"
    echo "Попытка автоматической установки через apt..."
    if command -v sudo &> /dev/null; then
        sudo apt update && sudo apt install -y $MISSING_DEPS
    else
        apt update && apt install -y $MISSING_DEPS
    fi
else
    echo "✅ Системные зависимости в порядке."
fi

# 2. Настройка Python-окружения (Защита от PEP 668)
echo "[2/4] Создание виртуального окружения Python..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo "✅ Flask и зависимости установлены в venv."

# 3. Компиляция llama.cpp
echo "[3/4] Компиляция llama.cpp..."
CUDA_FLAG=""
if command -v nvcc &> /dev/null; then
    echo "✅ CUDA найдена. Сборка с поддержкой GPU."
    CUDA_FLAG="-DGGML_CUDA=ON"
else
    echo "⚠️ CUDA не найдена. Сборка ТОЛЬКО на CPU (будет медленно)."
fi

if [ ! -d "llama.cpp" ]; then
    git clone https://github.com/ggml-org/llama.cpp.git
fi
cd llama.cpp

# Защита от OOM (Out of Memory) при компиляции
FREE_RAM=$(free -m | awk '/^Mem:/{print $7}')
if [ "$FREE_RAM" -lt 4000 ]; then
    echo "⚠️ Мало RAM (${FREE_RAM} МБ). Ограничиваем потоки сборки до 2."
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

# Создаем скрипт для удобного запуска
cat << 'RUNEOF' > run.sh
#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
python3 web_panel/app.py
RUNEOF
chmod +x run.sh

echo "======================================"
echo "✅ Установка успешно завершена!"
echo "Для запуска панели выполните: ./run.sh"
echo "======================================"
