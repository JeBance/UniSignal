import { useState, useEffect, useRef } from 'react';
import { Card, Button, Spinner, Alert, Badge, Form } from 'react-bootstrap';
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
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!adminKey) {
      setLoading(false);
      return;
    }
    loadClients();
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

  useEffect(() => {
    if (selectedClient && adminKey) {
      connectWebSocket(selectedClient);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [selectedClient]);

  const connectWebSocket = (apiKey: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = unisignalApi.connectWebSocket(apiKey);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.status === 'authenticated') {
            console.log('WebSocket authenticated');
          } else if (message.type === 'signal') {
            setSignals((prev) => [message.data, ...prev].slice(0, 50)); // Храним последние 50
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onerror = () => {
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
        <Card.Header>
          <strong>Последние сигналы</strong>{' '}
          <Badge bg="secondary">{signals.length}</Badge>
        </Card.Header>
        <Card.Body style={{ maxHeight: '600px', overflowY: 'auto' }}>
          {signals.length === 0 ? (
            <div className="text-center text-muted py-5">
              <p className="mb-0">Сигналов пока нет</p>
              <small>
                Подключитесь к WebSocket и ожидайте новые сообщения из Telegram-каналов
              </small>
            </div>
          ) : (
            signals.map((signal) => (
              <Card
                key={signal.id}
                className={`mb-3 border-${
                  signal.direction === 'LONG'
                    ? 'success'
                    : signal.direction === 'SHORT'
                    ? 'danger'
                    : 'secondary'
                }`}
              >
                <Card.Body>
                  <div className="d-flex justify-content-between">
                    <div>
                      <h5>
                        {signal.direction && (
                          <Badge
                            bg={signal.direction === 'LONG' ? 'success' : 'danger'}
                            className="me-2"
                          >
                            {signal.direction}
                          </Badge>
                        )}
                        {signal.ticker && <strong>{signal.ticker}</strong>}
                        <small className="text-muted ms-2">{signal.channel}</small>
                      </h5>

                      <div className="mt-2">
                        {signal.entryPrice && (
                          <span className="me-3">
                            📍 <strong>Вход:</strong> {signal.entryPrice}
                          </span>
                        )}
                        {signal.stopLoss && (
                          <span className="me-3 text-danger">
                            🛑 <strong>SL:</strong> {signal.stopLoss}
                          </span>
                        )}
                        {signal.takeProfit && (
                          <span className="text-success">
                            🎯 <strong>TP:</strong> {signal.takeProfit}
                          </span>
                        )}
                      </div>

                      {signal.text && (
                        <Card.Text className="mt-2 text-muted small">
                          {signal.text.length > 200
                            ? signal.text.substring(0, 200) + '...'
                            : signal.text}
                        </Card.Text>
                      )}
                    </div>
                    <div className="text-muted small">
                      {new Date(signal.timestamp * 1000).toLocaleString('ru-RU')}
                    </div>
                  </div>
                </Card.Body>
              </Card>
            ))
          )}
        </Card.Body>
      </Card>
    </>
  );
}
