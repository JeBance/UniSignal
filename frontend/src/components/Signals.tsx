import { useState, useEffect } from 'react';
import { Card, Button, Spinner, Alert, Badge, Form, Table, Modal, Pagination, Dropdown } from 'react-bootstrap';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useToast } from '../contexts/ToastContext';
import { getAllSignals, saveSignals, getLastSignalTimestamp } from '../services/signals-db';
import { type Signal } from '../api/unisignal';

interface SignalsProps {
  authType: 'admin' | 'client' | null;
}

export default function Signals({ authType }: SignalsProps) {
  const toast = useToast();
  const { isConnected, lastMessage } = useWebSocket();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  // Фильтры
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [filterChannel, setFilterChannel] = useState<string>('ALL');
  const [filterTicker, setFilterTicker] = useState<string>('');
  const [filterHasPrices, setFilterHasPrices] = useState<boolean>(false);
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
  const [itemsPerPage] = useState(20);

  // Реакция на новые сигналы из WebSocket
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'signal') {
      const signalData = lastMessage.data || lastMessage;
      if (signalData && signalData.id) {
        setSignals(prev => {
          const exists = prev.some(s => s.id === signalData.id);
          if (exists) return prev;
          return [signalData, ...prev];
        });
      }
    }
  }, [lastMessage]);

  // Загрузка сигналов из IndexedDB или API
  useEffect(() => {
    loadSignals();
  }, []);

  const loadSignals = async () => {
    try {
      // Сначала пробуем загрузить из IndexedDB
      const dbSignals = await getAllSignals();
      
      if (dbSignals && dbSignals.length > 0) {
        console.log(`Loaded ${dbSignals.length} signals from IndexedDB`);
        setSignals(dbSignals as Signal[]);
        
        // Проверяем пропущенные сигналы с сервера
        await loadMissingSignals();
      } else {
        // Если IndexedDB пуст, загружаем ВСЕ сигналы из API
        console.log('IndexedDB is empty, loading ALL signals from API...');
        const response = await fetch('/api/signals?limit=100000', {
          headers: authType === 'admin' 
            ? { 'X-Admin-Key': localStorage.getItem('adminKey') || '' }
            : { 'X-API-Key': localStorage.getItem('apiKey') || '' }
        });
        
        if (response.ok) {
          const data = await response.json();
          const apiSignals = data.signals || [];
          
          // Сохраняем ВСЕ сигналы в IndexedDB для будущего использования
          const dbFormat = apiSignals.map((s: any) => ({
            ...s,
            createdAt: Date.now()
          }));
          await saveSignals(dbFormat);
          
          setSignals(apiSignals);
          console.log(`Loaded ${apiSignals.length} signals from API and saved to IndexedDB`);
        }
      }
    } catch (err) {
      console.error('Failed to load signals:', err);
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
        const response = await fetch(`/api/signals?limit=100000&since=${lastTimestamp}`, {
          headers: authType === 'admin' 
            ? { 'X-Admin-Key': localStorage.getItem('adminKey') || '' }
            : { 'X-API-Key': localStorage.getItem('apiKey') || '' }
        });
        
        if (response.ok) {
          const data = await response.json();
          const newSignals = data.signals || [];
          
          if (newSignals.length > 0) {
            console.log(`Found ${newSignals.length} new signals`);
            
            // Сохраняем в IndexedDB
            const dbFormat = newSignals.map((s: any) => ({
              ...s,
              createdAt: Date.now()
            }));
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

  const clearSignals = () => {
    setSignals([]);
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

  if (!authType) {
    return (
      <Alert variant="info">Войдите для просмотра сигналов</Alert>
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
          <span className={`badge ${isConnected ? 'bg-success' : 'bg-danger'} me-2`}>
            {isConnected ? '● Подключено' : '○ Отключено'}
          </span>
          <Button variant="outline-secondary" size="sm" onClick={clearSignals}>
            Очистить
          </Button>
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
              <small>Ожидайте новые сигналы</small>
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
                              🏢 {signal.parsedSignal.signal.instrument.exchange}
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
                            {signal.entryPrice && !signal.parsedSignal?.signal?.trade_setup?.entry_price && (
                              <div>📍 <strong>Вход:</strong> ${signal.entryPrice}</div>
                            )}
                            {signal.stopLoss && !signal.parsedSignal?.signal?.trade_setup?.stop_loss && (
                              <div>🛑 <strong>Стоп:</strong> ${signal.stopLoss}</div>
                            )}
                            {signal.takeProfit && !signal.parsedSignal?.signal?.trade_setup?.targets && (
                              <div>🎯 <strong>Цель:</strong> ${signal.takeProfit}</div>
                            )}
                          </div>
                        )}

                        {/* Funding Info */}
                        {signal.parsedSignal?.signal?.funding_info && (
                          <div className="small p-2 bg-light rounded">
                            <div>💰 <strong>Funding:</strong> {signal.parsedSignal.signal.funding_info.funding_rate}%</div>
                            <div>⏰ <strong>Время:</strong> {signal.parsedSignal.signal.funding_info.funding_time}</div>
                            <div>📤 <strong>Получатель:</strong> {signal.parsedSignal.signal.funding_info.receiver}</div>
                            <div>💡 <strong>Рекомендация:</strong> {signal.parsedSignal.signal.funding_info.recommended_action}</div>
                          </div>
                        )}

                        {/* Confidence Factors */}
                        {signal.parsedSignal?.signal?.confidence?.factors && (
                          <div className="small mt-2">
                            <strong>Факторы уверенности:</strong>
                            <ul className="mb-0 mt-1">
                              {signal.parsedSignal.signal.confidence.factors.map((factor: string, idx: number) => (
                                <li key={idx}>{factor}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {/* Пагинация */}
              {totalPages > 1 && (
                <div className="d-flex justify-content-center mt-4">
                  <Pagination>
                    <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                    <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} />

                    {getVisiblePages().map((page, index) => (
                      <Pagination.Item
                        key={index}
                        active={page === currentPage}
                        onClick={() => typeof page === 'number' && setCurrentPage(page)}
                        disabled={page === '...'}
                      >
                        {page}
                      </Pagination.Item>
                    ))}

                    <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} />
                    <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                  </Pagination>
                </div>
              )}
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Filters Modal */}
      {showFiltersModal && (
        <Modal show={showFiltersModal} onHide={() => setShowFiltersModal(false)} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>🗂️ Фильтры сигналов</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Направление</Form.Label>
                <Form.Select value={filterDirection} onChange={(e) => setFilterDirection(e.target.value as any)}>
                  <option value="ALL">Все</option>
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Канал</Form.Label>
                <Form.Select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
                  <option value="ALL">Все каналы</option>
                  {uniqueChannels.map(channel => (
                    <option key={channel} value={channel}>{channel}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Тикер</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Поиск по тикеру..."
                  value={filterTicker}
                  onChange={(e) => setFilterTicker(e.target.value)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Тип сигнала</Form.Label>
                <Form.Select value={filterSignalType} onChange={(e) => setFilterSignalType(e.target.value)}>
                  <option value="ALL">Все типы</option>
                  {uniqueSignalTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Биржа</Form.Label>
                <Form.Select value={filterExchange} onChange={(e) => setFilterExchange(e.target.value)}>
                  <option value="ALL">Все биржи</option>
                  {uniqueExchanges.map(exchange => (
                    <option key={exchange} value={exchange}>{exchange}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Таймфрейм</Form.Label>
                <Form.Select value={filterTimeframe} onChange={(e) => setFilterTimeframe(e.target.value)}>
                  <option value="ALL">Все таймфреймы</option>
                  {uniqueTimeframes.map(timeframe => (
                    <option key={timeframe} value={timeframe}>{timeframe}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Мин. уверенность: {filterMinConfidence}%</Form.Label>
                <Form.Range
                  min={0}
                  max={100}
                  value={filterMinConfidence}
                  onChange={(e) => setFilterMinConfidence(parseInt(e.target.value))}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  label="Только с ценой входа"
                  checked={filterHasEntry}
                  onChange={(e) => setFilterHasEntry(e.target.checked)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  label="Только с целями"
                  checked={filterHasTargets}
                  onChange={(e) => setFilterHasTargets(e.target.checked)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  label="Только со стоп-лоссом"
                  checked={filterHasStopLoss}
                  onChange={(e) => setFilterHasStopLoss(e.target.checked)}
                />
              </Form.Group>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowFiltersModal(false)}>
              Закрыть
            </Button>
          </Modal.Footer>
        </Modal>
      )}

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

      {/* Signal Detail Modal */}
      {showModal && selectedSignal && (
        <Modal show={showModal} onHide={() => setShowModal(false)} size="xl">
          <Modal.Header closeButton>
            <Modal.Title>📡 Сигнал #{selectedSignal.id}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <h5>📥 Исходные данные</h5>
            <pre style={{ backgroundColor: '#1a1a1a', color: '#fff', padding: '15px', borderRadius: '5px' }}>
              {JSON.stringify({
                id: selectedSignal.id,
                channel: selectedSignal.channel,
                text: selectedSignal.text,
                timestamp: new Date(selectedSignal.timestamp * 1000).toISOString(),
              }, null, 2)}
            </pre>

            {selectedSignal.parsedSignal && (
              <>
                <h5 className="mt-4">🧠 Распарсенный сигнал</h5>
                <pre style={{ backgroundColor: '#1a1a1a', color: '#4ade80', padding: '15px', borderRadius: '5px' }}>
                  {JSON.stringify(selectedSignal.parsedSignal, null, 2)}
                </pre>
              </>
            )}

            <h5 className="mt-4">👁️ Читаемый вид</h5>
            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
              <p><strong>Канал:</strong> {selectedSignal.channel}</p>
              <p><strong>Тикер:</strong> {selectedSignal.ticker || 'Не указан'}</p>
              <p><strong>Направление:</strong> {selectedSignal.direction || 'Не указано'}</p>
              {selectedSignal.entryPrice && <p><strong>Цена входа:</strong> ${selectedSignal.entryPrice}</p>}
              {selectedSignal.stopLoss && <p><strong>Стоп-лосс:</strong> ${selectedSignal.stopLoss}</p>}
              {selectedSignal.takeProfit && <p><strong>Тейк-профит:</strong> ${selectedSignal.takeProfit}</p>}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Закрыть
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}
