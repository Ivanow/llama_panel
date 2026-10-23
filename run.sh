#!/bin/bash
cd "$(dirname "$0")"
MARKER=".deps_ok"

# ==========================================
# ЛОКАЛИЗАЦИЯ (Определение языка)
# ==========================================
# Проверяем, начинается ли локаль с "ru" (учитывает ru_RU, ru-RU, ru_UA и т.д.)
if [[ "${LANG,,}" =~ ^ru ]]; then
    MSG_HEADER="🚀 LlamaPanel"
    MSG_CHECK_FAST="✅ Система в порядке. Запускаю..."
    MSG_STOPPED="🛑 Панель остановлена."
    MSG_PRESS_ENTER="Нажмите Enter, чтобы закрыть окно..."
    MSG_CRITICAL_FLASK="⚠️ Критический сбой: Flask не найден!"
    MSG_MARKER_DELETED="Маркер удален. Запустите run.sh снова для переустановки."
    MSG_CHECKING_DEPS="🔍 Проверка зависимостей..."
    MSG_MISSING="❌ ВНИМАНИЕ! Не найдены следующие компоненты:"
    MSG_SYS="    Системные:"
    MSG_PY="    Python:"
    MSG_NO_PKGMGR="❌ Не удалось определить ваш пакетный менеджер (apt/dnf/pacman/apk/zypper). Установите пакеты вручную."
    MSG_INSTALL_PROMPT="Установить их сейчас? (д/н): "
    MSG_INSTALL_SYS="📦 Устанавливаю системные пакеты..."
    MSG_INSTALL_PY="📦 Устанавливаю Python-пакеты..."
    MSG_VENV_DETECTED="ℹ️ Обнаружено виртуальное окружение. Использую pip."
    MSG_INSTALL_DONE="✅ Установка завершена. Перепроверяем..."
    MSG_CANCELED="❌ Установка отменена. Без этих компонентов панель не заработает."
else
    MSG_HEADER="🚀 LlamaPanel"
    MSG_CHECK_FAST="✅ System is OK. Starting..."
    MSG_STOPPED="🛑 Panel stopped."
    MSG_PRESS_ENTER="Press Enter to close this window..."
    MSG_CRITICAL_FLASK="⚠️ Critical failure: Flask not found!"
    MSG_MARKER_DELETED="Marker deleted. Run run.sh again to reinstall."
    MSG_CHECKING_DEPS="🔍 Checking dependencies..."
    MSG_MISSING="❌ WARNING! Missing components:"
    MSG_SYS="    System:"
    MSG_PY="    Python:"
    MSG_NO_PKGMGR="❌ Could not detect your package manager (apt/dnf/pacman/apk/zypper). Install packages manually."
    MSG_INSTALL_PROMPT="Install them now? (y/n): "
    MSG_INSTALL_SYS="📦 Installing system packages..."
    MSG_INSTALL_PY="📦 Installing Python packages..."
    MSG_VENV_DETECTED="ℹ️ Virtual environment detected. Using pip."
    MSG_INSTALL_DONE="✅ Installation complete. Rechecking..."
    MSG_CANCELED="❌ Installation canceled. The panel won't work without these components."
fi

# --- ОКРУЖЕНИЕ И ПУТИ ---
if [ -n "$VIRTUAL_ENV" ]; then
    IN_VENV=1
    PYTHON_BIN="$VIRTUAL_ENV/bin/python3"
else
    IN_VENV=0
    PYTHON_BIN="python3"
fi

SUDO=$([ "$(id -u)" -eq 0 ] && echo "" || echo "sudo")

# --- ОПРЕДЕЛЕНИЕ ПАКЕТНОГО МЕНЕДЖЕРА ---
PKG_MGR=""
NET_PKG="iproute2"
PY_PKG=""

if command -v apt-get &>/dev/null; then
    PKG_MGR="apt"
    PY_PKG="python3-flask"
elif command -v dnf &>/dev/null; then
    PKG_MGR="dnf"
    NET_PKG="iproute"
    PY_PKG="python3-flask"
elif command -v pacman &>/dev/null; then
    PKG_MGR="pacman"
    PY_PKG="python-flask"
elif command -v apk &>/dev/null; then
    PKG_MGR="apk"
    PY_PKG="py3-flask"
elif command -v zypper &>/dev/null; then
    PKG_MGR="zypper"
    PY_PKG="python3-Flask"
fi

SYS_PKGS="tmux curl $NET_PKG"

# --- ФУНКЦИИ ---
check_deps() {
    MISSING_SYS=""
    MISSING_PY=""
    
    command -v tmux &>/dev/null || MISSING_SYS="$MISSING_SYS tmux"
    command -v curl &>/dev/null || MISSING_SYS="$MISSING_SYS curl"
    command -v ss &>/dev/null || MISSING_SYS="$MISSING_SYS $NET_PKG"
    
    if ! command -v "$PYTHON_BIN" &>/dev/null; then
        MISSING_PY="$MISSING_PY python3"
    elif ! "$PYTHON_BIN" -c "import flask" &>/dev/null; then
        MISSING_PY="$MISSING_PY flask"
    fi
}

exit_with_pause() {
    echo ""
    read -p "$1 $MSG_PRESS_ENTER" -r
    exit ${2:-0}
}

run_app() {
    echo "$MSG_CHECK_FAST"
    "$PYTHON_BIN" web_panel/app.py
    exit_with_pause "$MSG_STOPPED"
}

# --- ОСНОВНОЙ АЛГОРИТМ ---
echo "======================================"
echo "$MSG_HEADER"
echo "======================================"

if [ -f "$MARKER" ]; then
    if "$PYTHON_BIN" -c "import flask" &>/dev/null; then
        run_app
    else
        echo "$MSG_CRITICAL_FLASK"
        rm -f "$MARKER"
        exit_with_pause "$MSG_MARKER_DELETED" 1
    fi
fi

echo "$MSG_CHECKING_DEPS"
check_deps

if [ -z "$MISSING_SYS" ] && [ -z "$MISSING_PY" ]; then
    touch "$MARKER"
    run_app
fi

echo ""
echo "$MSG_MISSING"
[ -n "$MISSING_SYS" ] && echo "$MSG_SYS$MISSING_SYS"
[ -n "$MISSING_PY" ] && echo "$MSG_PY$MISSING_PY"
echo ""

if [ -z "$PKG_MGR" ] && { [ -n "$MISSING_SYS" ] || { [ -n "$MISSING_PY" ] && [ "$IN_VENV" -eq 0 ]; }; }; then
    exit_with_pause "$MSG_NO_PKGMGR" 1
fi

read -p "$MSG_INSTALL_PROMPT" -n 1 -r
echo ""

# Принимаем y/Y/д/Д
if [[ $REPLY =~ ^[YyДд]$ ]]; then
    # 1. Установка системных пакетов
    if [ -n "$MISSING_SYS" ]; then
        echo "$MSG_INSTALL_SYS ($SYS_PKGS)"
        case "$PKG_MGR" in
            apt)    $SUDO apt-get update && $SUDO apt-get install -y $SYS_PKGS ;;
            dnf)    $SUDO dnf install -y $SYS_PKGS ;;
            pacman) $SUDO pacman -Sy --noconfirm $SYS_PKGS ;;
            apk)    $SUDO apk add $SYS_PKGS ;;
            zypper) $SUDO zypper install -y $SYS_PKGS ;;
        esac
    fi

    # 2. Установка Python-пакетов
    if [ -n "$MISSING_PY" ]; then
        echo "$MSG_INSTALL_PY ($PY_PKG)"
        if [ "$IN_VENV" -eq 1 ]; then
            echo "$MSG_VENV_DETECTED"
            "$PYTHON_BIN" -m pip install flask
        else
            case "$PKG_MGR" in
                apt)    $SUDO apt-get install -y $PY_PKG ;;
                dnf)    $SUDO dnf install -y $PY_PKG ;;
                pacman) $SUDO pacman -S --noconfirm $PY_PKG ;;
                apk)    $SUDO apk add $PY_PKG ;;
                zypper) $SUDO zypper install -y $PY_PKG ;;
            esac
        fi
    fi

    echo "$MSG_INSTALL_DONE"
    exec "$0"
else
    exit_with_pause "$MSG_CANCELED" 1
fi