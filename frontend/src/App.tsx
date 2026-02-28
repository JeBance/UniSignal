import 'bootstrap/dist/css/bootstrap.min.css';
import { useState, useEffect } from 'react';
import { Container, Nav, Navbar, Alert, Spinner, Badge, Card, Form, Button, Modal } from 'react-bootstrap';
import { useTheme } from './contexts/ThemeContext';
import { useWebSocket } from './contexts/WebSocketContext';
import { useToast } from './contexts/ToastContext';
import Dashboard from './components/Dashboard';
import Clients from './components/Clients';
import Channels from './components/Channels';
import Signals from './components/Signals';
import { unisignalApi } from './api/unisignal';

type Page = 'dashboard' | 'clients' | 'channels' | 'signals';
type AuthType = 'admin' | 'client' | null;

function App() {
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const { connect: connectWebSocket, disconnect: disconnectWebSocket, isConnected, setOnSignalClick } = useWebSocket();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [authType, setAuthType] = useState<AuthType>(() => {
    return (localStorage.getItem('authType') as AuthType) || null;
  });
  const [authKey, setAuthKey] = useState(() => localStorage.getItem('authKey') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [healthOk, setHealthOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serverResponseTime, setServerResponseTime] = useState<number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [selectedSignalForModal, setSelectedSignalForModal] = useState<any | null>(null);
  const [showSignalModal, setShowSignalModal] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      const startTime = performance.now();
      try {
        await unisignalApi.health();
        const endTime = performance.now();
        setServerResponseTime(Math.round(endTime - startTime));
        setHealthOk(true);
      } catch {
        setHealthOk(false);
        setServerResponseTime(null);
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Установка обработчика клика на сигнал
  useEffect(() => {
    const handleSignalClick = (signal: any) => {
      console.log('Signal clicked:', signal.id);
      setSelectedSignalForModal(signal);
      setShowSignalModal(true);
      setCurrentPage('signals');
    };

    console.log('Setting onSignalClick handler');
    setOnSignalClick(() => handleSignalClick);

    return () => {
      console.log('Clearing onSignalClick handler');
      setOnSignalClick(() => undefined);
    };
  }, [setOnSignalClick]);

  useEffect(() => {
    // Проверяем ключ только при загрузке страницы из localStorage
    if (!authType || !authKey || isAuthenticated) return;

    const validateKey = async () => {
      try {
        const headers: Record<string, string> = {};
        if (authType === 'admin') {
          headers['X-Admin-Key'] = authKey;
        } else {
          headers['X-API-Key'] = authKey;
        }

        const response = await fetch('/api/auth/validate', { headers });
        const data = await response.json();

        if (!data.valid) {
          handleLogout();
        }
      } catch (err) {
        console.error('Auth validation error:', err);
      }
    };

    validateKey();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('authType');
    localStorage.removeItem('authKey');
    localStorage.removeItem('adminKey');
    localStorage.removeItem('apiKey');
    setAuthType(null);
    setAuthKey('');
    setIsAuthenticated(false);
    setAuthError(null);
    disconnectWebSocket();
  };

  const handleLogin = async () => {
    if (!authKey.trim()) return;
    
    setIsAuthenticating(true);
    setAuthError(null);
    
    try {
      const adminResponse = await fetch('/api/auth/validate', {
        headers: { 'X-Admin-Key': authKey }
      });
      const adminData = await adminResponse.json();

      if (adminData.valid && adminData.role === 'admin') {
        // Сохраняем ключи в localStorage СРАЗУ
        localStorage.setItem('authType', 'admin');
        localStorage.setItem('authKey', authKey);
        localStorage.setItem('adminKey', authKey);
        localStorage.removeItem('apiKey');

        setAuthType('admin');
        setIsAuthenticated(true);
        setIsAuthenticating(false);
        
        // Для админа: сначала загружаем клиентов и подключаемся с первым ключом
        fetchFirstClientKeyAndConnect(authKey);
        return;
      }

      const clientResponse = await fetch('/api/auth/validate', {
        headers: { 'X-API-Key': authKey }
      });
      const clientData = await clientResponse.json();

      if (clientData.valid && clientData.role === 'client') {
        // Сохраняем ключи в localStorage СРАЗУ
        localStorage.setItem('authType', 'client');
        localStorage.setItem('authKey', authKey);
        localStorage.setItem('apiKey', authKey);
        localStorage.removeItem('adminKey');

        setAuthType('client');
        setIsAuthenticated(true);
        setIsAuthenticating(false);
        
        // Подключаемся к WebSocket
        connectWebSocket(authKey);
      } else {
        setAuthError('Неверный ключ. Проверьте правильность ввода.');
        setIsAuthenticating(false);
      }
    } catch (err) {
      console.error('Auth error:', err);
      setAuthError('Ошибка подключения к серверу');
      setIsAuthenticating(false);
    }
  };

  // Загрузка первого клиентского ключа и подключение к WebSocket (для админа)
  const fetchFirstClientKeyAndConnect = async (adminKey: string) => {
    try {
      const response = await fetch('/admin/clients', {
        headers: { 'X-Admin-Key': adminKey }
      });
      const data = await response.json();

      if (data.clients && data.clients.length > 0) {
        const firstApiKey = data.clients[0].api_key;
        console.log('Connecting to WebSocket with first client API key:', firstApiKey.substring(0, 8) + '...');
        connectWebSocket(firstApiKey);
      } else {
        // Нет клиентов - создаём первого автоматически
        console.log('No clients found, creating first client automatically...');
        const createResponse = await fetch('/admin/clients', {
          method: 'POST',
          headers: { 'X-Admin-Key': adminKey }
        });
        const newClient = await createResponse.json();
        
        if (newClient.api_key) {
          console.log('Created new client, connecting to WebSocket...');
          connectWebSocket(newClient.api_key);
          toast.success('✅ Первый клиент создан автоматически');
        } else {
          console.warn('Failed to create client');
          toast.warning('⚠️ Не удалось создать клиента для WebSocket');
        }
      }
    } catch (err) {
      console.error('Failed to load/create client:', err);
      toast.error('❌ Ошибка подключения к WebSocket');
    }
  };

  const canAccessAdminOnly = authType === 'admin';

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!healthOk) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">
          <Alert.Heading>UniSignal недоступен</Alert.Heading>
          <p>
            Не удалось подключиться к серверу UniSignal. Убедитесь, что сервер запущен на порту 3001.
          </p>
          <hr />
          <p className="mb-0">Проверьте: <code>http://localhost:3001/health</code></p>
        </Alert>
      </Container>
    );
  }

  return (
    <>
      {isAuthenticated && (
        <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
          <Container>
            <Navbar.Brand href="#dashboard" onClick={() => setCurrentPage('dashboard')}>
              📡 UniSignal Relay
            </Navbar.Brand>
            <Navbar.Text className="d-none d-lg-flex align-items-center ms-3">
              <span
                className="d-inline-block rounded-circle me-2"
                style={{
                  width: '10px',
                  height: '10px',
                  backgroundColor: healthOk ? '#28a745' : '#dc3545',
                  boxShadow: healthOk ? '0 0 8px #28a745' : '0 0 8px #dc3545'
                }}
              />
              <span className={healthOk ? 'text-success' : 'text-danger'} style={{ fontSize: '0.85rem' }}>
                {healthOk ? `Онлайн ${serverResponseTime ? `(${serverResponseTime}ms)` : ''}` : 'Офлайн'}
              </span>
            </Navbar.Text>
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
            <Navbar.Collapse id="basic-navbar-nav">
              <Nav className="me-auto">
                <Nav.Link
                  active={currentPage === 'dashboard'}
                  onClick={() => setCurrentPage('dashboard')}
                >
                  📊 Dashboard
                </Nav.Link>
                <Nav.Link
                  active={currentPage === 'signals'}
                  onClick={() => setCurrentPage('signals')}
                >
                  📡 Сигналы
                </Nav.Link>
                {canAccessAdminOnly && (
                  <>
                    <Nav.Link
                      active={currentPage === 'clients'}
                      onClick={() => setCurrentPage('clients')}
                    >
                      👥 Клиенты
                    </Nav.Link>
                    <Nav.Link
                      active={currentPage === 'channels'}
                      onClick={() => setCurrentPage('channels')}
                    >
                      📺 Каналы
                    </Nav.Link>
                  </>
                )}
              </Nav>
              <Nav className="align-items-center">
                <button
                  className="btn btn-outline-light btn-sm me-3"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                >
                  {theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <span
                  className="me-3"
                  title={isConnected ? 'WebSocket подключен' : 'WebSocket отключен'}
                  style={{ cursor: 'default' }}
                >
                  <span
                    className="d-inline-block rounded-circle"
                    style={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: isConnected ? '#28a745' : '#dc3545',
                      boxShadow: isConnected ? '0 0 8px #28a745' : '0 0 8px #dc3545'
                    }}
                  />
                </span>
                <Navbar.Text className="me-3">
                  {authType === 'admin' ? (
                    <>🔑 Админ <Badge bg="primary">Admin</Badge></>
                  ) : (
                    <>👤 Клиент <Badge bg="info">Client</Badge></>
                  )}
                </Navbar.Text>
                <Nav.Link onClick={handleLogout}>Выйти</Nav.Link>
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>
      )}

      <Container>
        {!isAuthenticated ? (
          <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
            <Card style={{ maxWidth: '450px', width: '100%' }}>
              <Card.Header className="text-center py-3">
                <h3 className="mb-0">📡 UniSignal Relay</h3>
              </Card.Header>
              <Card.Body className="p-4">
                <h5 className="text-center mb-4">Авторизация</h5>
                <Form>
                  <Form.Group className="mb-3">
                    <Form.Label>Ключ доступа</Form.Label>
                    <Form.Control
                      type="password"
                      placeholder="Введите ADMIN_MASTER_KEY или API ключ клиента"
                      value={authKey}
                      onChange={(e) => setAuthKey(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      disabled={isAuthenticating}
                    />
                  </Form.Group>

                  {authError && (
                    <Alert variant="danger" className="mb-3">
                      {authError}
                    </Alert>
                  )}

                  <div className="d-grid">
                    <Button 
                      variant="primary" 
                      onClick={handleLogin}
                      disabled={!authKey.trim() || isAuthenticating}
                    >
                      {isAuthenticating ? (
                        <><Spinner as="span" animation="border" size="sm" className="me-2" />Проверка...</>
                      ) : (
                        'Войти'
                      )}
                    </Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </div>
        ) : (
          <>
            {currentPage === 'dashboard' && (
              <Dashboard authType={authType} />
            )}
            {currentPage === 'clients' && canAccessAdminOnly && (
              <Clients adminKey={authKey} />
            )}
            {currentPage === 'channels' && canAccessAdminOnly && (
              <Channels adminKey={authKey} />
            )}
            {currentPage === 'signals' && (
              <Signals adminKey={authKey} />
            )}
          </>
        )}
      </Container>

      {/* Signal Detail Modal */}
      {selectedSignalForModal && (
        <Modal show={showSignalModal} onHide={() => setShowSignalModal(false)} size="xl">
          <Modal.Header closeButton>
            <Modal.Title>📡 Сигнал #{selectedSignalForModal.id}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <h6>📥 Исходный текст:</h6>
            <pre className="bg-light p-3 rounded small">{selectedSignalForModal.text}</pre>
            {selectedSignalForModal.parsedSignal && (
              <>
                <h6 className="mt-4">🧠 Распарсенный сигнал:</h6>
                <pre className="bg-light p-3 rounded small">{JSON.stringify(selectedSignalForModal.parsedSignal, null, 2)}</pre>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowSignalModal(false)}>
              Закрыть
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}

export default App;
