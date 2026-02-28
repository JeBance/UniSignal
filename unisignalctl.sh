#!/bin/bash
# UniSignal Service Management Script
# Использование: ./unisignalctl.sh [start|stop|restart|status|logs|enable|disable]

SERVICE_NAME="unisignal"

case "$1" in
    start)
        echo "🚀 Запуск UniSignal сервиса..."
        systemctl start $SERVICE_NAME
        sleep 2
        systemctl status $SERVICE_NAME --no-pager | head -10
        ;;
    stop)
        echo "🛑 Остановка UniSignal сервиса..."
        systemctl stop $SERVICE_NAME
        systemctl status $SERVICE_NAME --no-pager | head -10
        ;;
    restart)
        echo "🔄 Перезапуск UniSignal сервиса..."
        systemctl restart $SERVICE_NAME
        sleep 2
        systemctl status $SERVICE_NAME --no-pager | head -10
        ;;
    status)
        systemctl status $SERVICE_NAME --no-pager
        ;;
    logs)
        echo "📋 Логи UniSignal (последние 50 строк)..."
        journalctl -u $SERVICE_NAME -n 50 --no-pager
        ;;
    follow)
        echo "📋 Мониторинг логов UniSignal (Ctrl+C для выхода)..."
        journalctl -u $SERVICE_NAME -f
        ;;
    enable)
        echo "✅ Включение автозапуска UniSignal..."
        systemctl enable $SERVICE_NAME
        echo "Сервис будет запускаться при загрузке системы"
        ;;
    disable)
        echo "❌ Отключение автозапуска UniSignal..."
        systemctl disable $SERVICE_NAME
        echo "Автозапуск отключён"
        ;;
    health)
        echo "🏥 Проверка Health endpoint..."
        curl -s http://localhost:3001/health | jq .
        ;;
    *)
        echo "UniSignal Service Management"
        echo ""
        echo "Использование: $0 {start|stop|restart|status|logs|follow|enable|disable|health}"
        echo ""
        echo "Команды:"
        echo "  start    - Запустить сервис"
        echo "  stop     - Остановить сервис"
        echo "  restart  - Перезапустить сервис"
        echo "  status   - Показать статус сервиса"
        echo "  logs     - Показать последние 50 строк логов"
        echo "  follow   - Мониторинг логов в реальном времени"
        echo "  enable   - Включить автозапуск при загрузке"
        echo "  disable  - Отключить автозапуск при загрузке"
        echo "  health   - Проверить Health endpoint"
        exit 1
        ;;
esac

exit 0
