import { useState, useEffect } from 'react';
import { Card, Button, Spinner, Alert, Badge, Table, Modal, Pagination } from 'react-bootstrap';
import { useWebSocket } from '../contexts/WebSocketContext';
import { getAllSignals } from '../services/signals-db';
import { type Signal } from '../api/unisignal';

interface SignalsProps {
  authType: 'admin' | 'client' | null;
}

export default function Signals({ authType }: SignalsProps) {
  const { isConnected } = useWebSocket();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  // Фильтры
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [filterChannel, setFilterChannel] = useState<string>('ALL');
  const [filterTicker, setFilterTicker] = useState<string>('');
  const [filterHasPrices, setFilterHasPrices] = useState<boolean>(false);

  // Сортировка
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Пагинация
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // Загрузка сигналов из IndexedDB
  useEffect(() => {
    loadSignalsFromDB();
  }, []);

  const loadSignalsFromDB = async () => {
    try {
      const dbSignals = await getAllSignals();
      setSignals(dbSignals as Signal[]);
    } catch (err) {
      console.error('Failed to load signals from IndexedDB:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearSignals = () => {
    setSignals([]);
  };

  // Применение фильтров и сортировки
  const filteredAndSortedSignals = (() => {
    let result = signals.filter(signal => {
      if (filterDirection !== 'ALL' && signal.direction !== filterDirection) return false;
      if (filterChannel !== 'ALL' && signal.channel !== filterChannel) return false;
      if (filterTicker && !signal.ticker?.toLowerCase().includes(filterTicker.toLowerCase())) return false;
      if (filterHasPrices && !signal.entryPrice && !signal.stopLoss && !signal.takeProfit) return false;
      return true;
    });

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

  useEffect(() => {
    setCurrentPage(1);
  }, [filterDirection, filterChannel, filterTicker, filterHasPrices]);

  const getVisiblePages = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('...');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }

    return pages;
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
            {(filterDirection !== 'ALL' || filterChannel !== 'ALL' || filterTicker || filterHasPrices) && (
              <Badge bg="info" className="ms-2">🔽 Фильтры активны</Badge>
            )}
          </div>
          <div>
            <Button variant="outline-secondary" size="sm" onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}>
              🕒 {sortOrder === 'desc' ? '↓' : '↑'}
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={clearSignals} className="ms-2">
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
              <Button variant="outline-danger" size="sm" className="mt-2" onClick={() => {
                setFilterDirection('ALL');
                setFilterChannel('ALL');
                setFilterTicker('');
                setFilterHasPrices(false);
              }}>
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
                        <Button variant="link" size="sm" className="p-0" onClick={() => {
                          setSelectedSignal(signal);
                          setShowModal(true);
                        }} style={{ textDecoration: 'none', color: 'inherit' }}>
                          <pre className="mb-0 small" style={{ fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', height: '200px', overflow: 'auto', backgroundColor: '#1a1a1a', color: '#ffffff', padding: '8px', borderRadius: '4px', textAlign: 'left', margin: 0 }}>
                            {JSON.stringify({ id: signal.id, channel: signal.channel, text: signal.text, timestamp: signal.timestamp }, null, 2)}
                          </pre>
                        </Button>
                      </td>
                      <td className="align-top" style={{ textAlign: 'left' }}>
                        <pre className="mb-0 small" style={{ fontSize: '11px', backgroundColor: '#1a1a1a', color: signal.parsedSignal ? '#4ade80' : '#9ca3af', padding: '8px', borderRadius: '4px', textAlign: 'left', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', height: '200px', overflow: 'auto' }}>
                          {signal.parsedSignal ? JSON.stringify({ type: signal.parsedSignal.signal?.type, ticker: signal.parsedSignal.signal?.instrument?.ticker, direction: signal.parsedSignal.signal?.direction?.side }, null, 2) : 'Нет данных парсинга'}
                        </pre>
                      </td>
                      <td className="align-top">
                        <div className="text-muted">{signal.channel} - {signal.ticker || 'No ticker'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {totalPages > 1 && (
                <div className="d-flex justify-content-center mt-4">
                  <Pagination>
                    <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                    <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} />
                    {getVisiblePages().map((page, index) => (
                      <Pagination.Item key={index} active={page === currentPage} onClick={() => typeof page === 'number' && setCurrentPage(page)} disabled={page === '...'}>{page}</Pagination.Item>
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

      {showModal && selectedSignal && (
        <Modal show={showModal} onHide={() => setShowModal(false)} size="xl">
          <Modal.Header closeButton>
            <Modal.Title>📡 Сигнал #{selectedSignal.id}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <h6>📥 Исходный текст:</h6>
            <pre className="bg-light p-3 rounded small">{selectedSignal.text}</pre>
            {selectedSignal.parsedSignal && (
              <>
                <h6 className="mt-4">🧠 Распарсенный сигнал:</h6>
                <pre className="bg-light p-3 rounded small">{JSON.stringify(selectedSignal.parsedSignal, null, 2)}</pre>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Закрыть</Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}
