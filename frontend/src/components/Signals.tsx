import { useState, useEffect, useRef } from 'react';
import { Card, Button, Spinner, Alert, Badge, Form, Table, Modal, Pagination, Dropdown } from 'react-bootstrap';
import { useToast } from '../contexts/ToastContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { unisignalApi, type Signal } from '../api/unisignal';
import { getAllSignals, saveSignals, getLastSignalTimestamp, signalToDB } from '../services/signals-db';

interface SignalsProps {
  adminKey: string;
}

export default function Signals({ adminKey }: SignalsProps) {
  const toast = useToast();
  const { isConnected, lastMessage } = useWebSocket();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const lastProcessedSignalId = useRef<number | null>(null);

  // Фильтры
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [filterChannel, setFilterChannel] = useState<string>('ALL');
  const [filterTicker, setFilterTicker] = useState<string>('');
  const [filterHasPrices, setFilterHasPrices] = useState<boolean>(false);

  // Расширенные фильтры (из parsedSignal)
  const [filterSignalType, setFilterSignalType] = useState<string>('ALL');
  const [filterExchange, setFilterExchange] = useState<string>('ALL');
  const [filterTimeframe, setFilterTimeframe] = useState<string>('ALL');
  const [filterMinConfidence, setFilterMinConfidence] = useState<number>(0);
  const [filterHasEntry, setFilterHasEntry] = useState<boolean>(false);
  const [filterHasTargets, setFilterHasTargets] = useState<boolean>(false);
  const [filterHasStopLoss, setFilterHasStopLoss] = useState<boolean>(false);
  const [showFiltersModal, setShowFiltersModal] = useState<boolean>(false);

  // Избранные пресеты фильтров
  const [filterPresets, setFilterPresets] = useState<Array<{ name: string; filters: Record<string, any> }>>(() => {
    const saved = localStorage.getItem('signalFilterPresets');
    return saved ? JSON.parse(saved) : [];
  });
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Сохранение пресетов в localStorage
  useEffect(() => {
    localStorage.setItem('signalFilterPresets', JSON.stringify(filterPresets));
  }, [filterPresets]);

  // Сохранение текущего фильтра как пресет
  const saveFilterPreset = () => {
    if (!presetName.trim()) return;

    const filters = {
      filterDirection,
      filterChannel,
      filterTicker,
      filterHasPrices,
      filterSignalType,
      filterExchange,
      filterTimeframe,
      filterMinConfidence,
      filterHasEntry,
      filterHasTargets,
      filterHasStopLoss,
    };

    setFilterPresets(prev => {
      const existing = prev.findIndex(p => p.name === presetName);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { name: presetName, filters };
        return updated;
      }
      return [...prev, { name: presetName, filters }];
    });

    setPresetName('');
    setShowSavePresetModal(false);
    toast.success(`💾 Пресет "${presetName}" сохранён`);
  };

  // Загрузка пресета
  const loadFilterPreset = (preset: { name: string; filters: Record<string, any> }) => {
    const { filters } = preset;
    setFilterDirection(filters.filterDirection);
    setFilterChannel(filters.filterChannel);
    setFilterTicker(filters.filterTicker);
    setFilterHasPrices(filters.filterHasPrices);
    setFilterSignalType(filters.filterSignalType);
    setFilterExchange(filters.filterExchange);
    setFilterTimeframe(filters.filterTimeframe);
    setFilterMinConfidence(filters.filterMinConfidence);
    setFilterHasEntry(filters.filterHasEntry);
    setFilterHasTargets(filters.filterHasTargets);
    setFilterHasStopLoss(filters.filterHasStopLoss);
    toast.info(`📂 Загружен пресет "${preset.name}"`);
  };

  // Удаление пресета
  const deleteFilterPreset = (name: string) => {
    setFilterPresets(prev => prev.filter(p => p.name !== name));
    toast.info(`🗑️ Пресет "${name}" удалён`);
  };

  // Сброс фильтров
  const resetFilters = () => {
    setFilterDirection('ALL');
    setFilterChannel('ALL');
    setFilterTicker('');
    setFilterHasPrices(false);
    setFilterSignalType('ALL');
    setFilterExchange('ALL');
    setFilterTimeframe('ALL');
    setFilterMinConfidence(0);
    setFilterHasEntry(false);
    setFilterHasTargets(false);
    setFilterHasStopLoss(false);
    toast.info('🔄 Фильтры сброшены');
  };

  // Сортировка
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Пагинация
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20); // Количество сигналов на странице

  const wsRef = useRef<WebSocket | null>(null);
  const apiKeyRef = useRef<string | null>(null);
  const { setOnSignalClick } = useWebSocket();

  // Устанавливаем обработчик клика на сигнал
  useEffect(() => {
    const handleSignalClick = (signal: any) => {
      console.log('Signal clicked in Signals.tsx:', signal.id);
      setSelectedSignal(signal);
      setShowModal(true);
    };

    setOnSignalClick(handleSignalClick);

    return () => {
      setOnSignalClick(undefined);
    };
  }, [setOnSignalClick]);

  // Синхронизация wsConnected с контекстом
  useEffect(() => {
    setWsConnected(isConnected);
  }, [isConnected]);

  // Обработка новых сигналов из WebSocket
  useEffect(() => {
    if (lastMessage && lastMessage.id) {
      // Проверяем, не обработали ли уже этот сигнал
      if (lastProcessedSignalId.current === lastMessage.id) {
        return;
      }
      lastProcessedSignalId.current = lastMessage.id;
      
      // Проверяем, есть ли уже такой сигнал в таблице
      setSignals(prev => {
        const exists = prev.some(s => s.id === lastMessage.id);
        if (exists) return prev;

        const newSignal = lastMessage;
        
        // Добавляем новый сигнал в начало списка
        toast.success(`📡 Новый сигнал добавлен в таблицу`);
        
        // НЕ открываем модальное окно автоматически
        // Оно откроется при клике на уведомление через onSignalClick
        
        // Подгружаем полную информацию с сервера для ЭТОГО сигнала
        fetch(`/admin/signals?limit=50`, {
          headers: { 'X-Admin-Key': adminKey }
        })
          .then(r => r.json())
          .then(data => {
            const signals: any[] = data.signals || [];
            // Находим наш сигнал в списке
            const fullSignal = signals.find((s: any) => s.id === newSignal.id);
            if (fullSignal) {
              // Обновляем сигнал в таблице полной версией
              setSignals(prev => prev.map(s => 
                s.id === newSignal.id ? { ...s, ...fullSignal } : s
              ));
            }
          })
          .catch(err => console.error('Failed to load full signal:', err));
        
        return [newSignal, ...prev];
      });
    }
  }, [lastMessage]);

  useEffect(() => {
    if (!adminKey) {
      setLoading(false);
      return;
    }
    loadRecentSignals();
    // WebSocket подключение происходит автоматически при авторизации в App.tsx
  }, [adminKey]);

  const loadRecentSignals = async () => {
    try {
      // Сначала пробуем загрузить из IndexedDB
      const dbSignals = await getAllSignals();

      if (dbSignals && dbSignals.length > 0) {
        console.log(`Loaded ${dbSignals.length} signals from IndexedDB`);
        const signalsWithParsed = dbSignals.filter((s: any) => s.parsedSignal);
        console.log(`Signals with parsedSignal from IndexedDB: ${signalsWithParsed.length}`);
        if (signalsWithParsed.length > 0) {
          console.log('First parsedSignal:', JSON.stringify(signalsWithParsed[0].parsedSignal, null, 2).substring(0, 200));
        }
        setSignals(dbSignals as Signal[]);

        // Проверяем пропущенные сигналы с сервера
        await loadMissingSignals();
      } else {
        // Если IndexedDB пуст, загружаем ВСЕ сигналы из API
        console.log('IndexedDB is empty, loading ALL signals from API...');
        const response = await fetch('/admin/signals?limit=100000', {
          headers: {
            'X-Admin-Key': adminKey,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const apiSignals = data.signals || [];
          
          // Сохраняем ВСЕ сигналы в IndexedDB для будущего использования
          const dbFormat = apiSignals.map((s: any) => signalToDB(s));
          await saveSignals(dbFormat);
          
          setSignals(apiSignals);
          console.log(`Loaded ${apiSignals.length} signals from API and saved to IndexedDB`);
        }
      }
    } catch (err) {
      console.error('Failed to load recent signals:', err);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка пропущенных сигналов с сервера
  const loadMissingSignals = async () => {
    try {
      // Получаем последний timestamp из IndexedDB
      const lastTimestamp = await getLastSignalTimestamp();
      
      if (lastTimestamp > 0) {
        console.log(`Checking for signals after ${new Date(lastTimestamp * 1000).toISOString()}`);
        
        // Запрашиваем только пропущенные сигналы через параметр since
        const response = await fetch(`/admin/signals?limit=100000&since=${lastTimestamp}`, {
          headers: {
            'X-Admin-Key': adminKey,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          const newSignals = data.signals || [];
          
          if (newSignals.length > 0) {
            console.log(`Found ${newSignals.length} new signals`);
            
            // Сохраняем в IndexedDB
            const dbFormat = newSignals.map((s: any) => signalToDB(s));
            await saveSignals(dbFormat);
            
            // Добавляем в таблицу
            setSignals(prev => [...newSignals, ...prev]);
            toast.success(`📥 Загружено ${newSignals.length} пропущенных сигналов`);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load missing signals:', err);
    }
  };

  // WebSocket подключение выполняется в ensureClientAndConnect()

  const connectWebSocket = (apiKey: string) => {
    // Сохраняем apiKey для переподключения
    apiKeyRef.current = apiKey;
    
    // Закрываем существующее соединение, если есть
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING) {
        console.log('Closing existing WebSocket connection...');
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    try {
      const ws = unisignalApi.connectWebSocket(apiKey);
      wsRef.current = ws;

      // Сохраняем оригинальный onopen (который отправляет аутентификацию) и добавляем логирование
      const originalOnopen = ws.onopen;
      ws.onopen = (event: Event) => {
        if (originalOnopen) originalOnopen.call(ws, event);
        console.log('WebSocket connected');
        setWsConnected(true);
        toast.success('✅ Подключено к WebSocket');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message:', message);

          if (message.status === 'authenticated') {
            console.log('✅ WebSocket authenticated');
          } else if (message.type === 'signal') {
            // Обрабатываем два формата сообщений:
            // 1. {type: 'signal', data: {...}} - от broadcast()
            // 2. {type: 'signal', action: 'new_signal', payload: {...}} - от broadcastSignal()
            const signalData = message.data || message.payload;

            if (!signalData) {
              console.warn('WebSocket signal без данных:', message);
              return;
            }

            setSignals((prev) => {
              const signalId = signalData.id ?? signalData.signal_id;
              if (!signalId) {
                console.warn('Сигнал без ID:', signalData);
                return prev;
              }

              const exists = prev.some(s => s.id === signalId);
              if (exists) return prev;

              // Показываем уведомление о новом сигнале
              const ticker = signalData.signal?.instrument?.ticker || signalData.ticker || '';
              const direction = signalData.signal?.direction?.side?.toUpperCase() || signalData.direction || '';
              const message = `📡 Новый сигнал: ${direction} ${ticker}`.trim();
              toast.success(message);

              // Преобразуем payload формат в data формат если нужно
              const formattedSignal = signalData.id
                ? signalData // Уже в формате data
                : {
                    id: signalData.signal_id,
                    channel: signalData.source?.channel || 'Unknown',
                    direction: signalData.signal?.direction?.side?.toUpperCase() || null,
                    ticker: signalData.signal?.instrument?.ticker || null,
                    entryPrice: signalData.signal?.trade_setup?.entry_price || null,
                    stopLoss: signalData.signal?.trade_setup?.stop_loss?.stop_0_5 || null,
                    takeProfit: signalData.signal?.trade_setup?.targets?.[0] || null,
                    text: signalData.source?.original_text || '',
                    timestamp: Math.floor(new Date(signalData.timestamp).getTime() / 1000),
                    parsedSignal: signalData,
                  };

              return [formattedSignal, ...prev].slice(0, 1000);
            });
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setWsConnected(false);
        toast.error(`❌ Отключено: ${event.reason || 'Неизвестная ошибка'}`);

        // Очищаем ссылку только если это текущее соединение
        if (wsRef.current === ws) {
          wsRef.current = null;
        }

        // Не пытаемся переподключиться при ошибках аутентификации
        if (event.code === 4001 || event.code === 4002) {
          console.error(`WebSocket authentication error (${event.code}): ${event.reason}`);
          return;
        }

        // Автоматическое переподключение через 5 секунд
        setTimeout(() => {
          if (apiKeyRef.current && adminKey && !wsRef.current) {
            console.log('Reconnecting...');
            connectWebSocket(apiKeyRef.current);
          }
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast.error('⚠️ Ошибка WebSocket соединения');
      };
    } catch (err) {
      console.error('Failed to connect to WebSocket');
    }
  };

  const clearSignals = () => {
    setSignals([]);
  };

  // Экспорт сигналов в CSV
  const exportToCSV = () => {
    const headers = ['ID', 'Канал', 'Тикер', 'Направление', 'Цена входа', 'Стоп-лосс', 'Тейк-профит', 'Время', 'Текст'];
    const rows = filteredAndSortedSignals.map(s => [
      s.id,
      s.channel,
      s.ticker || '',
      s.direction || '',
      s.entryPrice || '',
      s.stopLoss || '',
      s.takeProfit || '',
      new Date(s.timestamp * 1000).toISOString(),
      s.text?.replace(/[\n\r]+/g, ' ').substring(0, 100) || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    downloadFile(csvContent, 'signals.csv', 'text/csv');
    toast.info('📥 Сигналы экспортированы в CSV');
  };

  // Экспорт сигналов в JSON
  const exportToJSON = () => {
    const jsonContent = JSON.stringify(filteredAndSortedSignals, null, 2);
    downloadFile(jsonContent, 'signals.json', 'application/json');
    toast.info('📥 Сигналы экспортированы в JSON');
  };

  // Скачивание файла
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Получение уникальных значений для фильтров
  const uniqueChannels = Array.from(new Set(signals.map(s => s.channel))).sort();
  const uniqueSignalTypes = Array.from(new Set(signals
    .map(s => s.parsedSignal?.signal?.type)
    .filter(Boolean)
  )).sort();
  const uniqueExchanges = Array.from(new Set(signals
    .map(s => s.parsedSignal?.signal?.instrument?.exchange)
    .filter(Boolean)
  )).sort();
  const uniqueTimeframes = Array.from(new Set(signals
    .map(s => s.parsedSignal?.signal?.timing?.timeframe)
    .filter(Boolean)
  )).sort();

  // Применение фильтров и сортировки
  const filteredAndSortedSignals = (() => {
    // Сначала фильтруем
    let result = signals.filter(signal => {
      // Базовые фильтры
      if (filterDirection !== 'ALL' && signal.direction !== filterDirection) return false;
      if (filterChannel !== 'ALL' && signal.channel !== filterChannel) return false;
      if (filterTicker && !signal.ticker?.toLowerCase().includes(filterTicker.toLowerCase())) return false;
      if (filterHasPrices && !signal.entryPrice && !signal.stopLoss && !signal.takeProfit) return false;

      // Расширенные фильтры (из parsedSignal)
      const ps = signal.parsedSignal?.signal;
      
      if (filterSignalType !== 'ALL' && ps?.type !== filterSignalType) return false;
      if (filterExchange !== 'ALL' && ps?.instrument?.exchange !== filterExchange) return false;
      if (filterTimeframe !== 'ALL' && ps?.timing?.timeframe !== filterTimeframe) return false;
      
      if (ps?.confidence?.score && ps.confidence.score < filterMinConfidence) return false;
      
      if (filterHasEntry && !ps?.trade_setup?.entry_price) return false;
      if (filterHasTargets && (!ps?.trade_setup?.targets || ps.trade_setup.targets.length === 0)) return false;
      if (filterHasStopLoss && !ps?.trade_setup?.stop_loss) return false;

      return true;
    });

    // Затем сортируем по дате
    result.sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return result;
  })();

  // Пагинация
  const totalPages = Math.ceil(filteredAndSortedSignals.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentSignals = filteredAndSortedSignals.slice(startIndex, endIndex);

  // Сброс на первую страницу при изменении фильтров
  useEffect(() => {
    setCurrentPage(1);
  }, [filterDirection, filterChannel, filterTicker, filterHasPrices, filterSignalType, filterExchange, filterTimeframe, filterMinConfidence, filterHasEntry, filterHasTargets, filterHasStopLoss]);

  // Обновление списка каналов при загрузке новых сигналов
  useEffect(() => {
    if (signals.length > 0) {
      const channels = Array.from(new Set(signals.map(s => s.channel))).sort();
      // Если текущий выбранный канал отсутствует в списке, сбрасываем на 'ALL'
      if (filterChannel !== 'ALL' && !channels.includes(filterChannel)) {
        setFilterChannel('ALL');
      }
    }
  }, [signals]);

  // Функция для получения видимых страниц пагинации
  const getVisiblePages = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5; // Максимальное количество видимых страниц
    
    if (totalPages <= maxVisible + 2) {
      // Если страниц мало, показываем все
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Всегда показываем первую страницу
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      // Показываем страницы вокруг текущей
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      // Всегда показываем последнюю страницу
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  if (!adminKey) {
    return (
      <Alert variant="info">Введите ADMIN_MASTER_KEY для просмотра сигналов</Alert>
    );
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>📡 Живые сигналы</h2>
        <div>
          <span className={`badge ${wsConnected ? 'bg-success' : 'bg-danger'} me-2`}>
            {wsConnected ? '● Подключено' : '○ Отключено'}
          </span>
        </div>
      </div>

      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <strong>Последние сигналы</strong>{' '}
            <Badge bg="secondary">{filteredAndSortedSignals.length} / {signals.length}</Badge>
            {(filterDirection !== 'ALL' || filterChannel !== 'ALL' || filterTicker || filterHasPrices || 
              filterSignalType !== 'ALL' || filterExchange !== 'ALL' || filterTimeframe !== 'ALL' || 
              filterMinConfidence > 0 || filterHasEntry || filterHasTargets || filterHasStopLoss) && (
              <Badge bg="info" className="ms-2">🔽 Фильтры активны</Badge>
            )}
          </div>
          <div>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => setShowFiltersModal(true)}
              className="me-2"
            >
              🗂️ Фильтры
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="me-2"
              title={`Сортировка: ${sortOrder === 'desc' ? 'Сначала новые' : 'Сначала старые'}`}
            >
              🕒 {sortOrder === 'desc' ? '↓' : '↑'}
            </Button>
            <Dropdown className="d-inline me-2">
              <Dropdown.Toggle variant="outline-success" size="sm" id="export-dropdown">
                📥 Экспорт
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item onClick={exportToCSV}>CSV</Dropdown.Item>
                <Dropdown.Item onClick={exportToJSON}>JSON</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
            <Dropdown className="d-inline me-2">
              <Dropdown.Toggle variant="outline-info" size="sm" id="preset-dropdown">
                💾 Пресеты ({filterPresets.length})
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item onClick={() => setShowSavePresetModal(true)}>
                  ➕ Сохранить текущий
                </Dropdown.Item>
                <Dropdown.Divider />
                {filterPresets.length === 0 ? (
                  <Dropdown.ItemText>Нет сохранённых пресетов</Dropdown.ItemText>
                ) : (
                  filterPresets.map(preset => (
                    <Dropdown key={preset.name}>
                      <Dropdown.Item onClick={() => loadFilterPreset(preset)}>
                        {preset.name}
                      </Dropdown.Item>
                      <Dropdown.Item
                        onClick={(e) => { e.stopPropagation(); deleteFilterPreset(preset.name); }}
                        className="text-danger"
                      >
                        🗑️ Удалить
                      </Dropdown.Item>
                    </Dropdown>
                  ))
                )}
              </Dropdown.Menu>
            </Dropdown>
            <Button variant="outline-warning" size="sm" onClick={resetFilters}>
              🔄 Сброс
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={clearSignals}>
              Очистить
            </Button>
          </div>
        </Card.Header>

        <Card.Body>
          {currentSignals.length === 0 && signals.length === 0 ? (
            <div className="text-center text-muted py-5">
              <p className="mb-0">Сигналов пока нет</p>
              <small>
                Подключитесь к WebSocket и ожидайте новые сообщения из Telegram-каналов
              </small>
            </div>
          ) : currentSignals.length === 0 ? (
            <div className="text-center text-muted py-5">
              <p className="mb-0">Нет сигналов, соответствующих фильтрам</p>
              <Button
                variant="outline-danger"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setFilterDirection('ALL');
                  setFilterChannel('ALL');
                  setFilterTicker('');
                  setFilterHasPrices(false);
                }}
              >
                🔄 Сбросить фильтры
              </Button>
            </div>
          ) : (
            <div>
              <Table responsive hover size="sm" className="align-middle">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: '30%' }}>📥 Входные данные</th>
                    <th style={{ width: '30%' }}>🧠 После парсинга</th>
                    <th style={{ width: '40%' }}>👁️ Читаемый вид</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSignals.map((signal) => (
                    <tr key={signal.id}>
                      <td className="align-top" style={{ textAlign: 'left' }}>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0"
                          onClick={() => {
                            setSelectedSignal(signal);
                            setShowModal(true);
                        }}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <pre className="mb-0 small" style={{ 
                          fontSize: '11px', 
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          height: '200px',
                          overflow: 'auto',
                          backgroundColor: '#1a1a1a',
                          color: '#ffffff',
                          padding: '8px',
                          borderRadius: '4px',
                          textAlign: 'left',
                          margin: 0
                        }}>
                          {JSON.stringify({
                            id: signal.id,
                            channel: signal.channel,
                            text: signal.text,
                            timestamp: signal.timestamp
                          }, null, 2)}
                        </pre>
                      </Button>
                    </td>
                    <td className="align-top" style={{ textAlign: 'left' }}>
                      <pre className="mb-0 small" style={{
                        fontSize: '11px',
                        backgroundColor: '#1a1a1a',
                        color: signal.parsedSignal ? '#4ade80' : '#9ca3af',
                        padding: '8px',
                        borderRadius: '4px',
                        textAlign: 'left',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        height: '200px',
                        overflow: 'auto'
                      }}>
                        {signal.parsedSignal ? JSON.stringify({
                          type: signal.parsedSignal.signal?.type || null,
                          ticker: signal.parsedSignal.signal?.instrument?.ticker || null,
                          exchange: signal.parsedSignal.signal?.instrument?.exchange || null,
                          direction: signal.parsedSignal.signal?.direction?.side || null,
                          strength: signal.parsedSignal.signal?.direction?.strength || null,
                          timeframe: signal.parsedSignal.signal?.timing?.timeframe || null,
                          rsi: signal.parsedSignal.signal?.indicators?.rsi || null,
                          pattern: signal.parsedSignal.signal?.direction?.pattern || null,
                          pattern_strength: signal.parsedSignal.signal?.direction?.pattern_strength || null,
                          entry_price: signal.parsedSignal.signal?.trade_setup?.entry_price || null,
                          targets: signal.parsedSignal.signal?.trade_setup?.targets || null,
                          stop_loss: signal.parsedSignal.signal?.trade_setup?.stop_loss || null,
                          funding_rate: signal.parsedSignal.signal?.funding_info?.funding_rate || null,
                          confidence: signal.parsedSignal.signal?.confidence || null,
                        }, null, 2) : 'Нет данных парсинга'}
                      </pre>
                    </td>
                    <td className="align-top">
                      <div>
                        {/* Тип сигнала и приоритет */}
                        {signal.parsedSignal?.signal?.type && (
                          <div className="mb-2">
                            <Badge 
                              bg={
                                signal.parsedSignal.signal.type === 'strong_signal' ? 'danger' :
                                signal.parsedSignal.signal.type === 'medium_signal' ? 'warning' :
                                signal.parsedSignal.signal.type === 'funding_rate' ? 'info' :
                                'secondary'
                              }
                              className="me-1"
                            >
                              {signal.parsedSignal.signal.type === 'strong_signal' && '🔴 Strong'}
                              {signal.parsedSignal.signal.type === 'medium_signal' && '🟡 Medium'}
                              {signal.parsedSignal.signal.type === 'entry_signal' && '📊 Entry'}
                              {signal.parsedSignal.signal.type === 'quick_target' && '🎯 Quick'}
                              {signal.parsedSignal.signal.type === 'sentiment' && '📈 Sentiment'}
                              {signal.parsedSignal.signal.type === 'funding_rate' && '💰 Funding'}
                            </Badge>
                            {signal.parsedSignal.signal?.confidence?.score && (
                              <Badge 
                                bg={
                                  signal.parsedSignal.signal.confidence.score >= 70 ? 'success' :
                                  signal.parsedSignal.signal.confidence.score >= 50 ? 'warning' :
                                  'secondary'
                                }
                                className="ms-1"
                                title={`Confidence: ${signal.parsedSignal.signal.confidence.score}%`}
                              >
                                {signal.parsedSignal.signal.confidence.score}%
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Направление и тикер */}
                        <div className="mb-2">
                          {signal.parsedSignal?.signal?.direction?.side && (
                            <Badge
                              bg={signal.parsedSignal.signal.direction.side === 'long' ? 'success' : 
                                  signal.parsedSignal.signal.direction.side === 'short' ? 'danger' : 'secondary'}
                              className="me-2"
                              style={{ fontSize: '14px' }}
                            >
                              {signal.parsedSignal.signal.direction.side === 'long' && '⬆️ LONG'}
                              {signal.parsedSignal.signal.direction.side === 'short' && '⬇️ SHORT'}
                              {signal.parsedSignal.signal.direction.side === 'neutral' && '➡️ NEUTRAL'}
                            </Badge>
                          )}
                          {signal.parsedSignal?.signal?.instrument?.ticker && (
                            <strong style={{ fontSize: '16px' }}>
                              {signal.parsedSignal.signal.instrument.ticker}
                            </strong>
                          )}
                          {signal.parsedSignal?.signal?.instrument?.exchange && (
                            <span className="text-muted ms-2">
                              🏦 {signal.parsedSignal.signal.instrument.exchange}
                            </span>
                          )}
                        </div>

                        {/* Детали сигнала */}
                        <div className="small mb-2">
                          {/* Таймфрейм */}
                          {signal.parsedSignal?.signal?.timing?.timeframe && (
                            <div className="text-muted">
                              ⏱️ <strong>Таймфрейм:</strong> {signal.parsedSignal.signal.timing.timeframe}
                            </div>
                          )}

                          {/* Паттерн */}
                          {signal.parsedSignal?.signal?.direction?.pattern && (
                            <div className="text-muted">
                              📐 <strong>Паттерн:</strong> {signal.parsedSignal.signal.direction.pattern.replace('_', ' ')}
                              {signal.parsedSignal.signal.direction.pattern_strength && (
                                <span className="ms-2">
                                  ({signal.parsedSignal.signal.direction.pattern_strength}%)
                                </span>
                              )}
                            </div>
                          )}

                          {/* RSI */}
                          {signal.parsedSignal?.signal?.indicators?.rsi && (
                            <div className="text-muted">
                              📊 <strong>RSI:</strong> {signal.parsedSignal.signal.indicators.rsi}
                              {signal.parsedSignal.signal.indicators.rsi_signal && (
                                <span className={`ms-2 ${
                                  signal.parsedSignal.signal.indicators.rsi_signal === 'overbought' ? 'text-danger' :
                                  signal.parsedSignal.signal.indicators.rsi_signal === 'oversold' ? 'text-success' :
                                  ''
                                }`}>
                                  ({signal.parsedSignal.signal.indicators.rsi_signal})
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Торговые уровни */}
                        {(signal.parsedSignal?.signal?.trade_setup || signal.entryPrice) && (
                          <div className="small mb-2 p-2 bg-light rounded">
                            {signal.parsedSignal?.signal?.trade_setup?.entry_price && (
                              <div>📍 <strong>Вход:</strong> {signal.parsedSignal.signal.trade_setup.entry_price}</div>
                            )}
                            {signal.parsedSignal?.signal?.trade_setup?.targets && signal.parsedSignal.signal.trade_setup.targets.length > 0 && (
                              <div>
                                🎯 <strong>Цели:</strong> {signal.parsedSignal.signal.trade_setup.targets.join(' / ')}
                              </div>
                            )}
                            {signal.parsedSignal?.signal?.trade_setup?.stop_loss && (
                              <>
                                {signal.parsedSignal.signal.trade_setup.stop_loss.stop_0_5 && (
                                  <div>🛑 <strong>SL 0.5%:</strong> {signal.parsedSignal.signal.trade_setup.stop_loss.stop_0_5}</div>
                                )}
                                {signal.parsedSignal.signal.trade_setup.stop_loss.stop_1 && (
                                  <div>🛑 <strong>SL 1%:</strong> {signal.parsedSignal.signal.trade_setup.stop_loss.stop_1}</div>
                                )}
                              </>
                            )}
                            {signal.parsedSignal?.signal?.trade_setup?.expected_profit && (
                              <div className="text-success">
                                💰 <strong>Прибыль:</strong> {signal.parsedSignal.signal.trade_setup.expected_profit}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Funding Rate */}
                        {signal.parsedSignal?.signal?.funding_info && (
                          <div className="small mb-2 p-2 bg-light rounded">
                            <div className="text-danger">
                              💰 <strong>Funding Rate:</strong> {signal.parsedSignal.signal.funding_info.funding_rate}%
                            </div>
                            <div>
                              📅 <strong>Время:</strong> {new Date(signal.parsedSignal.signal.funding_info.funding_time).toLocaleString('ru-RU')}
                            </div>
                            <div>
                              👥 <strong>Получают:</strong> {signal.parsedSignal.signal.funding_info.receiver === 'longs' ? 'Лонги' : 'Шорты'}
                            </div>
                            <div className="text-success">
                              💡 <strong>Рекомендация:</strong> {signal.parsedSignal.signal.funding_info.recommended_action.toUpperCase()}
                            </div>
                          </div>
                        )}

                        {/* Канал и время */}
                        <div className="text-muted small mt-2 pt-2 border-top">
                          <div>📺 <strong>Канал:</strong> {signal.channel}</div>
                          <div>🕒 <strong>Время:</strong> {new Date(signal.timestamp * 1000).toLocaleString('ru-RU')}</div>
                          {signal.parsedSignal?.metadata?.language && (
                            <div>🌐 <strong>Язык:</strong> {signal.parsedSignal.metadata.language.toUpperCase()}</div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="d-flex justify-content-center mt-3">
                <Pagination>
                  <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                  <Pagination.Prev onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} />

                  {getVisiblePages().map((page, index) => (
                    typeof page === 'number' ? (
                      <Pagination.Item
                        key={index}
                        active={page === currentPage}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Pagination.Item>
                    ) : (
                      <Pagination.Ellipsis key={index} disabled />
                    )
                  ))}

                  <Pagination.Next onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} />
                  <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                </Pagination>
              </div>
            )}

            {/* Информация о странице */}
            <div className="text-center text-muted mt-2">
              <small>
                Показано {startIndex + 1}–{Math.min(endIndex, filteredAndSortedSignals.length)} из {filteredAndSortedSignals.length} сигналов
                {totalPages > 1 && ` (страница ${currentPage} из ${totalPages})`}
              </small>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>

    {/* Modal для фильтров */}
    <Modal show={showFiltersModal} onHide={() => setShowFiltersModal(false)} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>🗂️ Фильтры сигналов</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h6 className="mb-3">📊 Базовые фильтры</h6>
        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <Form.Group>
              <Form.Label>⬆️ Направление</Form.Label>
              <Form.Select
                value={filterDirection}
                onChange={(e) => setFilterDirection(e.target.value as 'ALL' | 'LONG' | 'SHORT')}
              >
                <option value="ALL">Все</option>
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </Form.Select>
            </Form.Group>
          </div>

          <div className="col-md-6">
            <Form.Group>
              <Form.Label>📺 Канал</Form.Label>
              <Form.Select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
              >
                <option value="ALL">Все каналы</option>
                {uniqueChannels.map(channel => (
                  <option key={channel} value={channel}>{channel}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>

          <div className="col-md-6">
            <Form.Group>
              <Form.Label>🏷️ Тикер</Form.Label>
              <Form.Control
                type="text"
                placeholder="Например: BTC"
                value={filterTicker}
                onChange={(e) => setFilterTicker(e.target.value)}
              />
            </Form.Group>
          </div>

          <div className="col-md-6">
            <Form.Group>
              <Form.Label className="d-block">💰 Цены</Form.Label>
              <Form.Check
                type="checkbox"
                id="filterHasPricesModal"
                label="Только с ценами"
                checked={filterHasPrices}
                onChange={(e) => setFilterHasPrices(e.target.checked)}
              />
            </Form.Group>
          </div>
        </div>

        <h6 className="mb-3">🔬 Расширенные фильтры</h6>
        <div className="row g-3">
          <div className="col-md-6">
            <Form.Group>
              <Form.Label>📊 Тип сигнала</Form.Label>
              <Form.Select
                value={filterSignalType}
                onChange={(e) => setFilterSignalType(e.target.value)}
              >
                <option value="ALL">Все типы</option>
                {uniqueSignalTypes.map(type => (
                  <option key={type} value={type}>
                    {type === 'strong_signal' && '🔴 Strong Signal'}
                    {type === 'medium_signal' && '🟡 Medium Signal'}
                    {type === 'entry_signal' && '📊 Entry Signal'}
                    {type === 'quick_target' && '🎯 Quick Target'}
                    {type === 'sentiment' && '📈 Sentiment'}
                    {type === 'funding_rate' && '💰 Funding Rate'}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>

          <div className="col-md-6">
            <Form.Group>
              <Form.Label>🏦 Биржа</Form.Label>
              <Form.Select
                value={filterExchange}
                onChange={(e) => setFilterExchange(e.target.value)}
              >
                <option value="ALL">Все биржи</option>
                {uniqueExchanges.map(exchange => (
                  <option key={exchange} value={exchange}>{exchange}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>

          <div className="col-md-6">
            <Form.Group>
              <Form.Label>⏱️ Таймфрейм</Form.Label>
              <Form.Select
                value={filterTimeframe}
                onChange={(e) => setFilterTimeframe(e.target.value)}
              >
                <option value="ALL">Все таймфреймы</option>
                {uniqueTimeframes.map(tf => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>

          <div className="col-md-6">
            <Form.Group>
              <Form.Label>🎯 Min Confidence: {filterMinConfidence}%</Form.Label>
              <Form.Range
                min={0}
                max={100}
                step={1}
                value={filterMinConfidence}
                onChange={(e) => setFilterMinConfidence(Number(e.target.value))}
              />
              <div className="d-flex justify-content-between small text-muted">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </Form.Group>
          </div>

          <div className="col-md-4">
            <Form.Group>
              <Form.Label className="d-block">📍 Вход</Form.Label>
              <Form.Check
                type="checkbox"
                id="filterHasEntryModal"
                label="Только с ценой входа"
                checked={filterHasEntry}
                onChange={(e) => setFilterHasEntry(e.target.checked)}
              />
            </Form.Group>
          </div>

          <div className="col-md-4">
            <Form.Group>
              <Form.Label className="d-block">🎯 Цели</Form.Label>
              <Form.Check
                type="checkbox"
                id="filterHasTargetsModal"
                label="Только с целями"
                checked={filterHasTargets}
                onChange={(e) => setFilterHasTargets(e.target.checked)}
              />
            </Form.Group>
          </div>

          <div className="col-md-4">
            <Form.Group>
              <Form.Label className="d-block">🛑 Стопы</Form.Label>
              <Form.Check
                type="checkbox"
                id="filterHasStopLossModal"
                label="Только со стоп-лоссом"
                checked={filterHasStopLoss}
                onChange={(e) => setFilterHasStopLoss(e.target.checked)}
              />
            </Form.Group>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="outline-danger"
          onClick={() => {
            setFilterDirection('ALL');
            setFilterChannel('ALL');
            setFilterTicker('');
            setFilterHasPrices(false);
            setFilterSignalType('ALL');
            setFilterExchange('ALL');
            setFilterTimeframe('ALL');
            setFilterMinConfidence(0);
            setFilterHasEntry(false);
            setFilterHasTargets(false);
            setFilterHasStopLoss(false);
          }}
        >
          🔄 Сбросить все
        </Button>
        <Button variant="secondary" onClick={() => setShowFiltersModal(false)}>
          Закрыть
        </Button>
        <Button variant="primary" onClick={() => setShowFiltersModal(false)}>
          Применить
        </Button>
      </Modal.Footer>
    </Modal>

    {/* Modal для сохранения пресета */}
    <Modal show={showSavePresetModal} onHide={() => setShowSavePresetModal(false)}>
      <Modal.Header closeButton>
        <Modal.Title>💾 Сохранить пресет фильтров</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group>
          <Form.Label>Название пресета</Form.Label>
          <Form.Control
            type="text"
            placeholder="Например: Только LONG с тикером"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveFilterPreset()}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowSavePresetModal(false)}>
          Отмена
        </Button>
        <Button variant="primary" onClick={saveFilterPreset} disabled={!presetName.trim()}>
          Сохранить
        </Button>
      </Modal.Footer>
    </Modal>

      {/* Modal для просмотра полных данных */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Данные сигнала #{selectedSignal?.id}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedSignal && (
            <>
              <h6>📥 Исходный текст сообщения:</h6>
              <pre className="bg-light p-3 rounded small" style={{ 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                {selectedSignal.text}
              </pre>
              
              <h6 className="mt-4">🧠 Распознанные данные:</h6>
              <Table bordered size="sm">
                <tbody>
                  <tr>
                    <th>Направление:</th>
                    <td>
                      {selectedSignal.direction ? (
                        <Badge bg={selectedSignal.direction === 'LONG' ? 'success' : 'danger'}>
                          {selectedSignal.direction}
                        </Badge>
                      ) : <span className="text-muted">Не определено</span>}
                    </td>
                  </tr>
                  <tr>
                    <th>Тикер:</th>
                    <td>{selectedSignal.ticker || <span className="text-muted">Не определено</span>}</td>
                  </tr>
                  <tr>
                    <th>Цена входа:</th>
                    <td>{selectedSignal.entryPrice || <span className="text-muted">Не указана</span>}</td>
                  </tr>
                  <tr>
                    <th>Stop Loss:</th>
                    <td>{selectedSignal.stopLoss || <span className="text-muted">Не указан</span>}</td>
                  </tr>
                  <tr>
                    <th>Take Profit:</th>
                    <td>{selectedSignal.takeProfit || <span className="text-muted">Не указан</span>}</td>
                  </tr>
                </tbody>
              </Table>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Закрыть
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
