import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SuperInfraLogo from '../components/SuperInfraLogo';

const defaultAdminEmail = process.env.REACT_APP_DEFAULT_ADMIN_EMAIL || (process.env.NODE_ENV !== 'production' ? 'admin@local.com' : '');
const defaultAdminPassword = process.env.REACT_APP_DEFAULT_ADMIN_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'admin123' : '');

export default function Login() {
  const { user, login, loading } = useAuth();
  const [email, setEmail] = useState(defaultAdminEmail);
  const [password, setPassword] = useState(defaultAdminPassword);
  const [error, setError] = useState('');
  if (user) return <Navigate to={user.role === 'tecnico' ? '/caixa-tecnico' : '/'} replace />;

  async function doLogin(loginEmail = email, loginPassword = password) {
    setError('');
    try {
      await login(loginEmail, loginPassword);
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao entrar.');
    }
  }

  async function submit(e) {
    e.preventDefault();
    await doLogin();
  }

  return (
    <div className="login-screen">
      <div className="login-hero">
        <div className="brand big superinfra-brand"><SuperInfraLogo big /></div>
        <h2>Estoque, patrimônio, técnicos, assinatura e BI em uma única operação.</h2>
        <p>Feito para controlar ONUs por número de série, materiais de campo, guias de entrega, baixas por OS e auditoria completa.</p>
        <div className="hero-grid"><b>Alertas vivos</b><b>Portal técnico</b><b>BI gerencial</b><b>Guia assinada</b></div>
      </div>
      <form className="login-card" onSubmit={submit}>
        <h1>Entrar</h1>
        <label>E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@empresa.com" /></label>
        <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
        {error && <div className="alert danger">{error}</div>}
        <button disabled={loading}>{loading ? 'Entrando...' : 'Acessar sistema'}</button>
        <small>Primeiro acesso local: o backend pode criar automaticamente o admin do .env com <code>AUTO_CREATE_ADMIN=true</code>.</small>
      </form>
    </div>
  );
}
