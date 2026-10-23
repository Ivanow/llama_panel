#!/bin/bash

# BASE_DIR можно переопределить переменной окружения LLAMA_BASE_DIR
BASE_DIR="${LLAMA_BASE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
INSTANCE=$1
ACTION=$2
CONF="$BASE_DIR/instances/$INSTANCE.conf"
SESSION="llama-$INSTANCE"
LOG="$BASE_DIR/logs/$INSTANCE.log"

# --- ЦВЕТА ДЛЯ ТЕРМИНАЛА ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RESET='\033[0m'

# Отключаем цвета, если вывод перенаправлен (например, в Flask / subprocess)
if [ ! -t 1 ]; then
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    RESET=''
fi

# Проверка аргументов
if [ -z "$INSTANCE" ] || [ -z "$ACTION" ]; then
    echo -e "${CYAN}Использование:${RESET} $0 <имя_инстанса> {start|stop|restart|status|logs}"
    exit 1
fi

# --- Поиск бинарника llama-server ---
BIN=""
CONFIG_FILE="$BASE_DIR/config.json"

# 1. Читаем путь из config.json через Python
if [ -f "$CONFIG_FILE" ]; then
    BIN=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('llama_binary', ''))" 2>/dev/null)
fi

# 2. Ищем в папке проекта или в PATH, если в конфиге пусто
if [ ! -x "$BIN" ]; then
    if [ -x "$BASE_DIR/build/bin/llama-server" ]; then
        BIN="$BASE_DIR/build/bin/llama-server"
    else
        BIN=$(command -v llama-server 2>/dev/null)
    fi
fi

# 3. Если так и не нашли — выходим с ошибкой
if [ ! -x "$BIN" ]; then
    echo -e "${RED}ОШИБКА:${RESET} Исполняемый файл llama-server не найден!"
    echo -e "Пожалуйста, укажите путь к нему в настройках панели или установите llama.cpp."
    exit 1
fi

# Загрузка и валидация конфига инстанса
if [ -f "$CONF" ]; then
    [ ! -s "$CONF" ] && { echo -e "${RED}ОШИБКА:${RESET} Файл конфигурации $CONF пуст!"; exit 1; }
    bash -n "$CONF" 2>/dev/null || { echo -e "${RED}ОШИБКА:${RESET} Обнаружена синтаксическая ошибка в файле конфигурации $CONF!"; exit 1; }
    source "$CONF"
elif [ "$ACTION" != "stop" ] && [ "$ACTION" != "status" ]; then
    echo -e "${RED}ОШИБКА:${RESET} Конфиг $CONF не найден!"
    exit 1
fi

# Дефолтные значения
PORT=${PORT:-8080}
EXTRA_ARGS=${EXTRA_ARGS:-""}

# Функция проверки готовности через /health
check_health() {
    [ "$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" 2>/dev/null)" = "200" ]
}

case "$ACTION" in
  start)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo -e "${YELLOW}Инстанс $INSTANCE УЖЕ ЗАПУЩЕН.${RESET}"
        exit 0
    fi
    
    # Точная проверка порта с границей слова во избежание ложных срабатываний
    if ss -tln 2>/dev/null | grep -qE ":$PORT\b"; then
        echo -e "${RED}ОШИБКА:${RESET} Порт $PORT занят! Освободите его."
        exit 1
    fi
    
    mkdir -p "$BASE_DIR/logs"
    echo -e "${BLUE}🚀 Запускаю инстанс ${CYAN}$INSTANCE${BLUE} на порту ${CYAN}$PORT${BLUE}...${RESET}"
    
    # Запуск в tmux с безопасным экранированием путей и дописыванием логов через tee -a
    tmux new-session -d -s "$SESSION" \
      "source ~/.bashrc 2>/dev/null; \"$BIN\" --model \"$MODEL\" --port \"$PORT\" --host 0.0.0.0 --alias \"$ALIAS\" $EXTRA_ARGS 2>&1 | tee -a \"$LOG\""
    
    echo -n "⏳ Загрузка модели: "
    START_TIME=$(date +%s)
    TIMEOUT=120
    
    while true; do
        ELAPSED=$(( $(date +%s) - START_TIME ))
        
        if ! tmux has-session -t "$SESSION" 2>/dev/null; then
            echo -e "\n${RED}❌ ОШИБКА: Процесс llama-server завершился аварийно!${RESET}"
            echo -e "Последние строки лога (${LOG}):"
            tail -n 20 "$LOG"
            exit 1
        fi
        
        if check_health; then
            echo -e "\n${GREEN}✅ ГОТОВО! Сервер отвечает 200 OK (за ${ELAPSED} сек).${RESET}"
            exit 0
        fi
        
        if [ $ELAPSED -ge $TIMEOUT ]; then
            echo -e "\n${YELLOW}⚠️ ТАЙМАУТ: Модель не загрузилась за $TIMEOUT сек.${RESET}"
            echo -e "Хвост лога:\n$(tail -n 5 "$LOG")"
            exit 1
        fi
        
        echo -n "."
        sleep 2
    done
    ;;
    
  stop)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        tmux kill-session -t "$SESSION"
        echo -e "${GREEN}🛑 Инстанс $INSTANCE успешно остановлен.${RESET}"
    else
        echo -e "${YELLOW}Инстанс $INSTANCE не запущен.${RESET}"
    fi
    ;;
    
  restart)
    "$0" "$INSTANCE" stop
    sleep 3
    "$0" "$INSTANCE" start
    ;;
    
  status)
    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
        echo -e "${RESET}⚪ СТАТУС: ${RED}STOPPED${RESET} (сессия tmux не найдена)"
        exit 0
    fi
    
    if check_health; then
        echo -e "${RESET}🟢 СТАТУС: ${GREEN}RUNNING${RESET} (порт $PORT, /health OK)"
    else
        if ss -tln 2>/dev/null | grep -qE ":$PORT\b"; then
            echo -e "${RESET}🟡 СТАТУС: ${YELLOW}LOADING${RESET} (порт $PORT слушается, модель в процессе загрузки)"
        else
            echo -e "${RESET}🔴 СТАТУС: ${RED}ERROR${RESET} (сессия есть, но порт $PORT не слушается)"
        fi
    fi
    ;;
    
  logs)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo -e "${CYAN}Подключаюсь к логам инстанса. Для выхода нажмите:${RESET} Ctrl+B, затем D."
        sleep 1
        tmux attach -t "$SESSION"
    else
        echo -e "${YELLOW}Инстанс не запущен. Последние 50 строк исторического лога:${RESET}"
        tail -n 50 "$LOG" 2>/dev/null || echo "Лог отсутствует."
    fi
    ;;
    
  *)
    echo -e "${RED}Неизвестное действие:${RESET} $ACTION"
    exit 1
    ;;
esac