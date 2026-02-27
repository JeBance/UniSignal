import 'bootstrap/dist/css/bootstrap.min.css';
import { useState, useEffect } from 'react';
import { Container, Nav, Navbar, Alert, Spinner } from 'react-bootstrap';
import Dashboard from './components/Dashboard';
import Clients from './components/Clients';
import Channels from './components/Channels';
import Signals from './components/Signals';
import { unisignalApi } from './api/unisignal';

type Page = 'dashboard' | 'clients' | 'channels' | 'signals';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('adminKey') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [healthOk, setHealthOk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Проверка health endpoint
    unisignalApi.health()
      .then(() => {
        setHealthOk(true);
        setLoading(false);
      })
      .catch(() => {
        setHealthOk(false);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (adminKey) {
      localStorage.setItem('adminKey', adminKey);
      setIsAuthenticated(true);
    }
  }, [adminKey]);

  const handleLogout = () => {
    localStorage.removeItem('adminKey');
    setAdminKey('');
    setIsAuthenticated(false);
  };

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
            </Nav>
            <Nav>
              {isAuthenticated ? (
                <>
                  <Navbar.Text className="me-3">
                    🔑 Админ авторизован
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
          <Alert variant="warning" onClose={() => setCurrentPage('dashboard')} dismissible>
            <Alert.Heading>Требуется авторизация</Alert.Heading>
            <p>
              Для доступа к админ-панели введите мастер-ключ в поле ниже.
            </p>
            <div className="mt-3">
              <input
                type="password"
                className="form-control"
                placeholder="Введите ADMIN_MASTER_KEY"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                style={{ maxWidth: '400px' }}
              />
            </div>
          </Alert>
        )}

        {currentPage === 'dashboard' && <Dashboard adminKey={adminKey} />}
        {currentPage === 'clients' && <Clients adminKey={adminKey} />}
        {currentPage === 'channels' && <Channels adminKey={adminKey} />}
        {currentPage === 'signals' && <Signals adminKey={adminKey} />}
      </Container>
    </>
  );
}

export default App;
