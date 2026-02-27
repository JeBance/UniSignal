import { useState, useEffect } from 'react';
import { Card, Button, Table, Spinner, Alert, Modal, Form, Badge } from 'react-bootstrap';
import { unisignalApi, type Channel } from '../api/unisignal';

interface ChannelsProps {
  adminKey: string;
}

export default function Channels({ adminKey }: ChannelsProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminKey) {
      setLoading(false);
      return;
    }
    loadChannels();
  }, [adminKey]);

  const loadChannels = async () => {
    try {
      const response = await unisignalApi.getChannels(true);
      setChannels(response.data.channels);
      setError(null);
    } catch (err) {
      setError('Не удалось загрузить каналы');
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!newChannelName || !newChannelId) {
      setError('Введите название и ID канала');
      return;
    }

    try {
      await unisignalApi.addChannel(parseInt(newChannelId), newChannelName);
      setShowModal(false);
      setNewChannelName('');
      setNewChannelId('');
      loadChannels();
    } catch (err) {
      setError('Не удалось добавить канал');
    }
  };

  const handleDeleteChannel = async (chatId: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот канал?')) return;

    try {
      await unisignalApi.deleteChannel(chatId);
      loadChannels();
    } catch (err) {
      setError('Не удалось удалить канал');
    }
  };

  const handleToggleChannel = async (channel: Channel) => {
    try {
      await unisignalApi.toggleChannel(channel.chat_id, !channel.is_active);
      loadChannels();
    } catch (err) {
      setError('Не удалось обновить статус канала');
    }
  };

  if (!adminKey) {
    return (
      <Alert variant="info">Введите ADMIN_MASTER_KEY для управления каналами</Alert>
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
        <h2>📺 Каналы Telegram</h2>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          + Добавить канал
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Alert variant="info">
        <Alert.Heading>ℹ️ Белый список каналов</Alert.Heading>
        <p>
          UniSignal будет обрабатывать сообщения только из каналов, добавленных в этот список.
          ID канала можно получить через Telegrab или бота @getmyid_bot.
        </p>
      </Alert>

      <Card>
        <Card.Body>
          <Table responsive hover>
            <thead>
              <tr>
                <th>ID канала</th>
                <th>Название</th>
                <th>Статус</th>
                <th>Обновлён</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {channels.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    Каналов нет. Добавьте первый канал.
                  </td>
                </tr>
              ) : (
                channels.map((channel) => (
                  <tr key={channel.chat_id}>
                    <td>
                      <code>{channel.chat_id}</code>
                    </td>
                    <td>{channel.name}</td>
                    <td>
                      <Badge bg={channel.is_active ? 'success' : 'secondary'}>
                        {channel.is_active ? 'Активен' : 'Отключён'}
                      </Badge>
                    </td>
                    <td>{new Date(channel.updated_at).toLocaleDateString('ru-RU')}</td>
                    <td>
                      <Button
                        variant={channel.is_active ? 'warning' : 'success'}
                        size="sm"
                        className="me-2"
                        onClick={() => handleToggleChannel(channel)}
                      >
                        {channel.is_active ? 'Отключить' : 'Включить'}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteChannel(channel.chat_id)}
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
          <Modal.Title>Добавить канал</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>ID канала</Form.Label>
              <Form.Control
                type="number"
                placeholder="-1001234567890"
                value={newChannelId}
                onChange={(e) => setNewChannelId(e.target.value)}
              />
              <Form.Text className="text-muted">
                ID можно получить через @getmyid_bot
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Название</Form.Label>
              <Form.Control
                type="text"
                placeholder="Например: Crypto Signals"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleAddChannel}>
            Добавить
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
