import { useState, useEffect } from 'react';
import { Card, Row, Col, Spinner, Alert, Button } from 'react-bootstrap';
import { unisignalApi, type Stats } from '../api/unisignal';

interface DashboardProps {
  adminKey: string;
}

export default function Dashboard({ adminKey }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminKey) {
      setLoading(false);
      return;
    }

    loadStats();
    const interval = setInterval(loadStats, 30000); // Обновление каждые 30 секунд
    return () => clearInterval(interval);
  }, [adminKey]);

  const loadStats = async () => {
    try {
      const response = await unisignalApi.getStats();
      setStats(response.data);
      setError(null);
    } catch (err) {
      setError('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  };

  if (!adminKey) {
    return (
      <Alert variant="info">
        Введите ADMIN_MASTER_KEY выше для просмотра статистики
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Alert variant="danger">
        {error || 'Статистика недоступна'}
        <Button variant="outline-light" size="sm" className="ms-2" onClick={loadStats}>
          Обновить
        </Button>
      </Alert>
    );
  }

  return (
    <>
      <h2 className="mb-4">📊 Dashboard</h2>

      <Row className="mb-4">
        <Col md={3}>
          <Card bg="primary" text="white">
            <Card.Body>
              <Card.Title>Сообщения</Card.Title>
              <Card.Text className="display-4">{stats.messages.total}</Card.Text>
              <small>Сегодня: {stats.messages.today}</small>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card bg="success" text="white">
            <Card.Body>
              <Card.Title>LONG сигналы</Card.Title>
              <Card.Text className="display-4">{stats.messages.long_count}</Card.Text>
              <small>С тикером: {stats.messages.with_ticker}</small>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card bg="danger" text="white">
            <Card.Body>
              <Card.Title>SHORT сигналы</Card.Title>
              <Card.Text className="display-4">{stats.messages.short_count}</Card.Text>
              <small>Активных каналов: {stats.channels.active}</small>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card bg="info" text="white">
            <Card.Body>
              <Card.Title>Клиенты</Card.Title>
              <Card.Text className="display-4">{stats.clients.total}</Card.Text>
              <small>Активных: {stats.clients.active}</small>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Card>
            <Card.Header>
              <strong>📈 Статистика сообщений</strong>
            </Card.Header>
            <Card.Body>
              <ul className="list-group list-group-flush">
                <li className="list-group-item d-flex justify-content-between">
                  <span>Всего сообщений</span>
                  <strong>{stats.messages.total}</strong>
                </li>
                <li className="list-group-item d-flex justify-content-between">
                  <span>За сегодня</span>
                  <strong>{stats.messages.today}</strong>
                </li>
                <li className="list-group-item d-flex justify-content-between">
                  <span>С тикером</span>
                  <strong>{stats.messages.with_ticker}</strong>
                </li>
                <li className="list-group-item d-flex justify-content-between">
                  <span>LONG</span>
                  <span className="text-success">{stats.messages.long_count}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between">
                  <span>SHORT</span>
                  <span className="text-danger">{stats.messages.short_count}</span>
                </li>
              </ul>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card>
            <Card.Header>
              <strong>👥 Клиенты и каналы</strong>
            </Card.Header>
            <Card.Body>
              <ul className="list-group list-group-flush">
                <li className="list-group-item d-flex justify-content-between">
                  <span>Всего клиентов</span>
                  <strong>{stats.clients.total}</strong>
                </li>
                <li className="list-group-item d-flex justify-content-between">
                  <span>Активных клиентов</span>
                  <strong>{stats.clients.active}</strong>
                </li>
                <li className="list-group-item d-flex justify-content-between">
                  <span>Активных каналов</span>
                  <strong>{stats.channels.active}</strong>
                </li>
              </ul>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
