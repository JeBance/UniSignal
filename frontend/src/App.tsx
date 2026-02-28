import 'bootstrap/dist/css/bootstrap.min.css';
import { useState, useEffect } from 'react';
import { Container, Nav, Navbar, Alert, Spinner, Badge, Card, Form, Button } from 'react-bootstrap';
import { useTheme } from './contexts/ThemeContext';
import Dashboard from './components/Dashboard';
import Clients from './components/Clients';
import Channels from './components/Channels';
import Signals from './components/Signals';
import { unisignalApi } from './api/unisignal';

type Page = 'dashboard' | 'clients' | 'channels' | 'signals';
type AuthType = 'admin' | 'client' | null;

function App() {
  const { theme, toggleTheme } = useTheme();
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

  useEffect(() => {
    if (!authType || !authKey) {
      setIsAuthenticated(false);
      return;
    }

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
        
        if (data.valid) {
          setIsAuthenticated(true);
          setAuthError(null);
          if (data.role === 'admin') {
            localStorage.setItem('adminKey', authKey);
            localStorage.removeItem('apiKey');
          } else {
            localStorage.setItem('apiKey', authKey);
            localStorage.removeItem('adminKey');
          }
        } else {
          handleLogout();
        }
      } catch (err) {
        console.error('Auth validation error:', err);
        setIsAuthenticated(true);
      }
    };

    validateKey();
  }, [authType, authKey]);

  useEffect(() => {
    if (authType && authKey) {
      localStorage.setItem('authType', authType);
      localStorage.setItem('authKey', authKey);
      setIsAuthenticated(true);
    }
  }, [authType, authKey]);

  const handleLogout = () => {
    localStorage.removeItem('authType');
    localStorage.removeItem('authKey');
    localStorage.removeItem('adminKey');
    localStorage.removeItem('apiKey');
    setAuthType(null);
    setAuthKey('');
    setIsAuthenticated(false);
    setAuthError(null);
  };

  const handleLogin = async () => {
    if (!authKey.trim()) return;
    
    setIsAuthenticating(true);
    setAuthError(null);
    
    try {
      // Сначала пробуем как админский ключ
      const adminResponse = await fetch('/api/auth/validate', {
        headers: { 'X-Admin-Key': authKey }
      });
      const adminData = await adminResponse.json();
      
      if (adminData.valid && adminData.role === 'admin') {
        setAuthType('admin');
        return;
      }
      
      // Если не админ, пробуем как клиентский ключ
      const clientResponse = await fetch('/api/auth/validate', {
        headers: { 'X-API-Key': authKey }
      });
      const clientData = await clientResponse.json();
      
      if (clientData.valid && clientData.role === 'client') {
        setAuthType('client');
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
              <Signals 
                adminKey={authType === 'admin' ? authKey : null}
                apiKey={authType === 'client' ? authKey : null}
                authType={authType}
              />
            )}
          </>
        )}
      </Container>
    </>
  );
}

export default App;
