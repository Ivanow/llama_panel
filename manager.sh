#!/bin/bash
# BASE_DIR можно переопределить переменной окружения LLAMA_BASE_DIR
BASE_DIR="${LLAMA_BASE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BIN="$BASE_DIR/build/bin/llama-server"
INSTANCE=$1
ACTION=$2
CONF="$BASE_DIR/instances/$INSTANCE.conf"
SESSION="llama-$INSTANCE"
LOG="$BASE_DIR/logs/$INSTANCE.log"

# Проверка аргументов
if [ -z "$INSTANCE" ] || [ -z "$ACTION" ]; then
    echo "Использование: $0 <имя_инстанса> {start|stop|restart|status|logs}"
    exit 1
fi

# Загрузка и валидация конфига
if [ -f "$CONF" ]; then
    # 1. Защита от пустых файлов (размер 0 байт)
    if [ ! -s "$CONF" ]; then
        echo "ОШИБКА: Файл конфигурации $CONF пуст!"
        exit 1
    fi
    
    # 2. Защита от синтаксических ошибок (проверка через bash -n)
    if ! bash -n "$CONF" 2>/dev/null; then
        echo "ОШИБКА: Обнаружена синтаксическая ошибка в файле конфигурации $CONF!"
        exit 1
    fi
    
    source "$CONF"
else
    if [ "$ACTION" != "stop" ] && [ "$ACTION" != "status" ]; then
        echo "ОШИБКА: Конфиг $CONF не найден!"
        exit 1
    fi
fi

# Дефолтные значения
PORT=${PORT:-8080}
EXTRA_ARGS=${EXTRA_ARGS:-""}

# Функция проверки готовности через /health
check_health() {
    local code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" 2>/dev/null)
    if [ "$code" = "200" ]; then
        return 0 # Готов
    else
        return 1 # Еще грузится (503) или упал
    fi
}

case "$ACTION" in
  start)
    # 1. Проверка, не запущен ли уже
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "Инстанс $INSTANCE УЖЕ ЗАПУЩЕН."
        exit 0
    fi
    
    # 2. Проверка занятости порта
    if ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
        echo "ОШИБКА: Порт $PORT занят! Освободите его."
        exit 1
    fi
    
    mkdir -p "$BASE_DIR/logs"
    echo "🚀 Запускаю $INSTANCE на порту $PORT..."
    
    # Запуск с передачей аргументов
    tmux new-session -d -s "$SESSION" \
      "source ~/.bashrc 2>/dev/null; $BIN --model $MODEL --port $PORT --host 0.0.0.0 --alias $ALIAS $EXTRA_ARGS 2>&1 | tee $LOG"
    
    # 3. Статус-бар загрузки
    echo -n "⏳ Загрузка модели: "
    START_TIME=$(date +%s)
    TIMEOUT=120 # Максимум 2 минуты на загрузку
    
    while true; do
        ELAPSED=$(( $(date +%s) - START_TIME ))
        
        # Проверяем, жива ли сессия tmux (не упала ли)
        if ! tmux has-session -t "$SESSION" 2>/dev/null; then
            echo -e "\n❌ ОШИБКА: Процесс llama-server завершился!"
            echo "Последние строки лога:"
            tail -n 20 "$LOG"
            exit 1
        fi
        
        # Проверяем /health
        if check_health; then
            echo -e "\n✅ ГОТОВО! Сервер отвечает 200 OK (за ${ELAPSED} сек)."
            exit 0
        fi
        
        # Проверка таймаута
        if [ $ELAPSED -ge $TIMEOUT ]; then
            echo -e "\n⚠️ ТАЙМАУТ: Модель не загрузилась за $TIMEOUT сек."
            echo "Возможно, не хватает VRAM или модель повреждена."
            echo "Лог: $(tail -n 5 "$LOG")"
            exit 1
        fi
        
        # Анимация (точки)
        echo -n "."
        sleep 2
    done
    ;;
    
  stop)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        tmux kill-session -t "$SESSION"
        echo "🛑 Инстанс $INSTANCE остановлен."
    else
        echo "Инстанс $INSTANCE не запущен."
    fi
    ;;
    
  restart)
    "$0" "$INSTANCE" stop
    sleep 3
    "$0" "$INSTANCE" start
    ;;
    
  status)
    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "⚪ СТАТУС: STOPPED (сессия не найдена)"
        exit 0
    fi
    
    # Проверяем здоровье
    if check_health; then
        echo "🟢 СТАТУС: RUNNING (порт $PORT, /health OK)"
    else
        if ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
            echo "🟡 СТАТУС: LOADING (порт $PORT слушается, но модель еще не готова)"
        else
            echo "🔴 СТАТУС: ERROR (сессия есть, но порт $PORT не слушается)"
        fi
    fi
    ;;
    
  logs)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "Подключаюсь к логам. Выход: Ctrl+B, затем D."
        sleep 1
        tmux attach -t "$SESSION"
    else
        echo "Инстанс не запущен. Исторический лог:"
        tail -n 50 "$LOG" 2>/dev/null || echo "Лог отсутствует."
    fi
    ;;
    
  *)
    echo "Неизвестное действие: $ACTION"
    exit 1
    ;;
esac
