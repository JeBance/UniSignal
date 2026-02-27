import { useState, useEffect, useRef } from 'react';
import { Card, Button, Spinner, Alert, Badge, Form, Table, Modal } from 'react-bootstrap';
import { unisignalApi, type Signal, type Client } from '../api/unisignal';

interface SignalsProps {
  adminKey: string;
}

export default function Signals({ adminKey }: SignalsProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  
  // Фильтры
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [filterChannel, setFilterChannel] = useState<string>('ALL');
  const [filterTicker, setFilterTicker] = useState<string>('');
  const [filterHasPrices, setFilterHasPrices] = useState<boolean>(false);
  
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!adminKey) {
      setLoading(false);
      return;
    }
    loadClients();
    loadRecentSignals();
  }, [adminKey]);

  const loadClients = async () => {
    try {
      const response = await unisignalApi.getClients();
      setClients(response.data.clients);
      if (response.data.clients.length > 0 && !selectedClient) {
        setSelectedClient(response.data.clients[0].api_key);
      }
    } catch (err) {
      console.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const loadRecentSignals = async () => {
    try {
      const response = await fetch('/admin/signals?limit=1000', {
        headers: {
          'X-Admin-Key': adminKey,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const formattedSignals = data.signals.map((s: any) => ({
          ...s,
          channel: s.channel || 'Unknown',
        }));
        setSignals(formattedSignals);
      }
    } catch (err) {
      console.error('Failed to load recent signals:', err);
    }
  };

  useEffect(() => {
    if (selectedClient && adminKey && !wsConnected) {
      connectWebSocket(selectedClient);
    }

    return () => {
      // Cleanup
    };
  }, [selectedClient, adminKey, wsConnected]);

  const connectWebSocket = (apiKey: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = unisignalApi.connectWebSocket(apiKey);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message:', message);

          if (message.status === 'authenticated') {
            console.log('✅ WebSocket authenticated');
          } else if (message.type === 'signal') {
            setSignals((prev) => {
              const exists = prev.some(s => s.id === message.data.id);
              if (exists) return prev;
              return [message.data, ...prev].slice(0, 1000);
            });
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setWsConnected(false);
        setTimeout(() => {
          if (selectedClient && adminKey) {
            console.log('Reconnecting...');
            connectWebSocket(selectedClient);
          }
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (err) {
      console.error('Failed to connect to WebSocket');
    }
  };

  const clearSignals = () => {
    setSignals([]);
  };

  // Получение уникальных каналов для фильтра
  const uniqueChannels = Array.from(new Set(signals.map(s => s.channel))).sort();

  // Применение фильтров
  const filteredSignals = signals.filter(signal => {
    if (filterDirection !== 'ALL' && signal.direction !== filterDirection) return false;
    if (filterChannel !== 'ALL' && signal.channel !== filterChannel) return false;
    if (filterTicker && !signal.ticker?.toLowerCase().includes(filterTicker.toLowerCase())) return false;
    if (filterHasPrices && !signal.entryPrice && !signal.stopLoss && !signal.takeProfit) return false;
    return true;
  });

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
          <Button
            variant={wsConnected ? 'success' : 'danger'}
            disabled
            className="me-2"
          >
            {wsConnected ? '● Подключено' : '○ Отключено'}
          </Button>
          <Button variant="outline-secondary" onClick={clearSignals}>
            Очистить
          </Button>
        </div>
      </div>

      {clients.length === 0 ? (
        <Alert variant="warning">
          <Alert.Heading>Нет клиентов</Alert.Heading>
          <p>
            Для подключения к WebSocket необходимо создать клиента.
            Перейдите на вкладку <strong>👥 Клиенты</strong> и создайте нового клиента.
          </p>
        </Alert>
      ) : (
        <Card className="mb-4">
          <Card.Body>
            <Form>
              <Form.Group>
                <Form.Label>Выберите клиента для подключения</Form.Label>
                <Form.Select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  style={{ maxWidth: '500px' }}
                >
                  {clients.map((client) => (
                    <option key={client.id} value={client.api_key}>
                      {client.id.slice(0, 8)}... - {client.api_key}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Form>
          </Card.Body>
        </Card>
      )}

      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <strong>Последние сигналы</strong>{' '}
            <Badge bg="secondary">{filteredSignals.length} / {signals.length}</Badge>
          </div>
          <Button variant="outline-secondary" size="sm" onClick={clearSignals}>
            Очистить
          </Button>
        </Card.Header>
        
        {/* Фильтры */}
        <div className="p-3 bg-light border-bottom">
          <div className="row g-3">
            <div className="col-md-3">
              <Form.Group>
                <Form.Label><strong>⬆️ Направление</strong></Form.Label>
                <Form.Select 
                  value={filterDirection} 
                  onChange={(e) => setFilterDirection(e.target.value as 'ALL' | 'LONG' | 'SHORT')}
                  size="sm"
                >
                  <option value="ALL">Все</option>
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </Form.Select>
              </Form.Group>
            </div>
            
            <div className="col-md-3">
              <Form.Group>
                <Form.Label><strong>📺 Канал</strong></Form.Label>
                <Form.Select 
                  value={filterChannel} 
                  onChange={(e) => setFilterChannel(e.target.value)}
                  size="sm"
                >
                  <option value="ALL">Все каналы</option>
                  {uniqueChannels.map(channel => (
                    <option key={channel} value={channel}>{channel}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            
            <div className="col-md-3">
              <Form.Group>
                <Form.Label><strong>🏷️ Тикер</strong></Form.Label>
                <Form.Control 
                  type="text" 
                  placeholder="Например: BTC"
                  value={filterTicker}
                  onChange={(e) => setFilterTicker(e.target.value)}
                  size="sm"
                />
              </Form.Group>
            </div>
            
            <div className="col-md-3">
              <Form.Group>
                <Form.Label><strong>💰 Цены</strong></Form.Label>
                <div className="d-flex align-items-center mt-2">
                  <Form.Check 
                    type="checkbox"
                    id="filterHasPrices"
                    label="Только с ценами"
                    checked={filterHasPrices}
                    onChange={(e) => setFilterHasPrices(e.target.checked)}
                  />
                </div>
              </Form.Group>
            </div>
          </div>
          
          {/* Кнопка сброса фильтров */}
          {(filterDirection !== 'ALL' || filterChannel !== 'ALL' || filterTicker || filterHasPrices) && (
            <div className="mt-3">
              <Button 
                variant="outline-danger" 
                size="sm"
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
          )}
        </div>

        <Card.Body>
          {filteredSignals.length === 0 && signals.length === 0 ? (
            <div className="text-center text-muted py-5">
              <p className="mb-0">Сигналов пока нет</p>
              <small>
                Подключитесь к WebSocket и ожидайте новые сообщения из Telegram-каналов
              </small>
            </div>
          ) : filteredSignals.length === 0 ? (
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
            <Table responsive hover size="sm" className="align-middle">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '30%' }}>📥 Входные данные</th>
                  <th style={{ width: '30%' }}>🧠 После парсинга</th>
                  <th style={{ width: '40%' }}>👁️ Читаемый вид</th>
                </tr>
              </thead>
              <tbody>
                {filteredSignals.map((signal) => (
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
                        color: signal.direction ? '#4ade80' : '#9ca3af',
                        padding: '8px',
                        borderRadius: '4px',
                        textAlign: 'left',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        height: '200px',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify({
                          direction: signal.direction || null,
                          ticker: signal.ticker || null,
                          entryPrice: signal.entryPrice || null,
                          stopLoss: signal.stopLoss || null,
                          takeProfit: signal.takeProfit || null
                        }, null, 2)}
                      </pre>
                    </td>
                    <td className="align-top">
                      <div>
                        {signal.direction && (
                          <Badge
                            bg={signal.direction === 'LONG' ? 'success' : 'danger'}
                            className="me-2"
                          >
                            {signal.direction}
                          </Badge>
                        )}
                        {signal.ticker && <strong>{signal.ticker}</strong>}
                        <small className="text-muted d-block mb-2">{signal.channel}</small>
                        
                        <div className="small">
                          {signal.entryPrice && (
                            <div>📍 <strong>Вход:</strong> {signal.entryPrice}</div>
                          )}
                          {signal.stopLoss && (
                            <div>🛑 <strong>SL:</strong> {signal.stopLoss}</div>
                          )}
                          {signal.takeProfit && (
                            <div>🎯 <strong>TP:</strong> {signal.takeProfit}</div>
                          )}
                        </div>
                        
                        <div className="text-muted small mt-2">
                          🕒 {new Date(signal.timestamp * 1000).toLocaleString('ru-RU')}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

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
