import 'bootstrap/dist/css/bootstrap.min.css';
import { useState, useEffect } from 'react';
import { Container, Nav, Navbar, Alert, Spinner, Badge } from 'react-bootstrap';
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
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('adminKey') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [healthOk, setHealthOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serverResponseTime, setServerResponseTime] = useState<number | null>(null);

  useEffect(() => {
    // Проверка health endpoint с замером времени ответа
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
    
    // Проверка каждые 30 секунд
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Проверка валидности ключа при загрузке
  useEffect(() => {
    if (!authType) {
      setIsAuthenticated(false);
      return;
    }

    const validateKey = async () => {
      try {
        const response = await unisignalApi.validateAuth();
        if (response.data.valid) {
          setIsAuthenticated(true);
          // Обновляем тип аутентификации если изменился
          if (response.data.role && response.data.role !== authType) {
            setAuthType(response.data.role);
          }
        } else {
          // Ключ невалиден - сбрасываем аутентификацию
          handleLogout();
        }
      } catch (err) {
        console.error('Auth validation error:', err);
        // При ошибке валидации не сбрасываем, даём пользователю работать
        setIsAuthenticated(true);
      }
    };

    validateKey();
  }, [authType]);

  useEffect(() => {
    if (authType === 'admin' && adminKey) {
      localStorage.setItem('authType', 'admin');
      localStorage.setItem('adminKey', adminKey);
      localStorage.removeItem('apiKey');
      setIsAuthenticated(true);
    } else if (authType === 'client' && apiKey) {
      localStorage.setItem('authType', 'client');
      localStorage.setItem('apiKey', apiKey);
      localStorage.removeItem('adminKey');
      setIsAuthenticated(true);
    }
  }, [authType, adminKey, apiKey]);

  const handleLogout = () => {
    localStorage.removeItem('authType');
    localStorage.removeItem('adminKey');
    localStorage.removeItem('apiKey');
    setAuthType(null);
    setAdminKey('');
    setApiKey('');
    setIsAuthenticated(false);
  };

  const handleLogin = (type: 'admin' | 'client') => {
    setAuthType(type);
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
              {isAuthenticated ? (
                <>
                  <Navbar.Text className="me-3">
                    {authType === 'admin' ? (
                      <>🔑 Админ <Badge bg="primary">Admin</Badge></>
                    ) : (
                      <>👤 Гость <Badge bg="info">Client</Badge></>
                    )}
                  </Navbar.Text>
                  <Nav.Link onClick={handleLogout}>Выйти</Nav.Link>
                </>
              ) : (
                <Nav.Link onClick={() => setCurrentPage('dashboard')}>
                  Войти
                </Nav.Link>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container>
        {!isAuthenticated && (
          <Alert variant="warning" className="mb-4">
            <Alert.Heading>Требуется авторизация</Alert.Heading>
            <p>
              Выберите тип авторизации:
            </p>
            
            <div className="mt-3">
              <Nav variant="pills" defaultActiveKey="#admin" className="mb-3">
                <Nav.Item>
                  <Nav.Link 
                    href="#admin"
                    active={authType === 'admin'}
                    onClick={(e) => { e.preventDefault(); setAuthType('admin'); }}
                  >
                    🔑 Админ
                  </Nav.Link>
                </Nav.Item>
                <Nav.Item>
                  <Nav.Link 
                    href="#client"
                    active={authType === 'client'}
                    onClick={(e) => { e.preventDefault(); setAuthType('client'); }}
                  >
                    👤 Клиент
                  </Nav.Link>
                </Nav.Item>
              </Nav>

              {authType === 'admin' ? (
                <div>
                  <p>Введите мастер-ключ для доступа к админ-панели:</p>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="ADMIN_MASTER_KEY"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    style={{ maxWidth: '400px' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin('admin')}
                  />
                  <button
                    className="btn btn-primary mt-2"
                    onClick={() => handleLogin('admin')}
                    disabled={!adminKey}
                  >
                    Войти как админ
                  </button>
                </div>
              ) : (
                <div>
                  <p>Введите API ключ клиента для просмотра сигналов:</p>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="API_KEY"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    style={{ maxWidth: '400px' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin('client')}
                  />
                  <button
                    className="btn btn-info mt-2 text-white"
                    onClick={() => handleLogin('client')}
                    disabled={!apiKey}
                  >
                    Войти как клиент
                  </button>
                </div>
              )}
            </div>
          </Alert>
        )}

        {currentPage === 'dashboard' && (
          <Dashboard 
            adminKey={authType === 'admin' ? adminKey : null}
            apiKey={authType === 'client' ? apiKey : null}
            authType={authType}
          />
        )}
        {currentPage === 'clients' && canAccessAdminOnly && (
          <Clients adminKey={adminKey} />
        )}
        {currentPage === 'channels' && canAccessAdminOnly && (
          <Channels adminKey={adminKey} />
        )}
        {currentPage === 'signals' && (
          <Signals 
            adminKey={authType === 'admin' ? adminKey : null}
            apiKey={authType === 'client' ? apiKey : null}
            authType={authType}
          />
        )}
      </Container>
    </>
  );
}

export default App;
