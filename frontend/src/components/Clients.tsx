import { useState, useEffect } from 'react';
import { Card, Button, Table, Spinner, Alert, Modal } from 'react-bootstrap';
import { unisignalApi, type Client } from '../api/unisignal';

interface ClientsProps {
  adminKey: string;
}

export default function Clients({ adminKey }: ClientsProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
    } catch (err) {
      setError('Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    try {
      await unisignalApi.createClient();
      setShowModal(false);
      loadClients();
    } catch (err) {
      setError('Не удалось создать клиента');
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого клиента?')) return;

    try {
      await unisignalApi.deleteClient(id);
      loadClients();
    } catch (err) {
      setError('Не удалось удалить клиента');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('API ключ скопирован!');
  };

  if (!adminKey) {
    return (
      <Alert variant="info">Введите ADMIN_MASTER_KEY для управления клиентами</Alert>
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
        <h2>👥 Клиенты</h2>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          + Создать клиента
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <Card.Body>
          <Table responsive hover>
            <thead>
              <tr>
                <th>ID</th>
                <th>API Ключ</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    Клиентов нет. Создайте первого клиента.
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <code>{client.id.slice(0, 8)}...</code>
                    </td>
                    <td>
                      <code>{client.api_key}</code>
                      <Button
                        variant="link"
                        size="sm"
                        className="ms-2"
                        onClick={() => copyToClipboard(client.api_key)}
                      >
                        📋
                      </Button>
                    </td>
                    <td>
                      <span
                        className={`badge bg-${client.is_active ? 'success' : 'secondary'}`}
                      >
                        {client.is_active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td>{new Date(client.created_at).toLocaleDateString('ru-RU')}</td>
                    <td>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteClient(client.id)}
                      >
                        Удалить
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Создать нового клиента</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Будет создан новый API ключ для доступа к WebSocket.
            Вы сможете использовать его для подключения клиентов к UniSignal.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleCreateClient}>
            Создать
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
