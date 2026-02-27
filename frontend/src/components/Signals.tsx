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
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
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
      // Автовыбор первого клиента
      if (response.data.clients.length > 0 && !selectedClient) {
        setSelectedClient(response.data.clients[0].api_key);
      }
    } catch (err) {
      setError('Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  };

  const loadRecentSignals = async () => {
    try {
      const response = await fetch('/admin/signals?limit=50', {
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
      // Не закрываем соединение при размонтировании компонента
      // чтобы сохранить подключение при навигации
    };
  }, [selectedClient, adminKey]);

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
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message:', message);

          if (message.status === 'authenticated') {
            console.log('✅ WebSocket authenticated');
          } else if (message.type === 'signal') {
            setSignals((prev) => {
              // Проверяем, нет ли уже такого сигнала
              const exists = prev.some(s => s.id === message.data.id);
              if (exists) return prev;
              return [message.data, ...prev].slice(0, 50);
            });
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setWsConnected(false);
        // Автоматическое переподключение через 5 секунд
        setTimeout(() => {
          if (selectedClient && adminKey) {
            console.log('Reconnecting...');
            connectWebSocket(selectedClient);
          }
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Ошибка WebSocket соединения');
      };
    } catch (err) {
      setError('Не удалось подключиться к WebSocket');
    }
  };

  const clearSignals = () => {
    setSignals([]);
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

      {error && <Alert variant="danger">{error}</Alert>}

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
        <Card.Header className="d-flex justify-content-between align-items-center">
          <div>
            <strong>Последние сигналы</strong>{' '}
            <Badge bg="secondary">{signals.length}</Badge>
          </div>
          <Button variant="outline-secondary" size="sm" onClick={clearSignals}>
            Очистить
          </Button>
        </Card.Header>
        <Card.Body style={{ maxHeight: '700px', overflowY: 'auto' }}>
          {signals.length === 0 ? (
            <div className="text-center text-muted py-5">
              <p className="mb-0">Сигналов пока нет</p>
              <small>
                Подключитесь к WebSocket и ожидайте новые сообщения из Telegram-каналов
              </small>
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
                {signals.map((signal) => (
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
                          maxHeight: '150px',
                          overflow: 'auto',
                          backgroundColor: '#1a1a1a',
                          color: '#ffffff',
                          padding: '8px',
                          borderRadius: '4px',
                          textAlign: 'left'
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
                        textAlign: 'left'
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
