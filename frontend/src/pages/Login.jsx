import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SuperInfraLogo from '../components/SuperInfraLogo';

const loginExample = 'usuario@exemplo.com';

export default function Login() {
  const { user, login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <form className="login-card" onSubmit={submit} autoComplete="off">
        <h1>Entrar</h1>
        <label>E-mail ou usuário<input value={email} onChange={(e) => setEmail(e.target.value)} name="superinfra_login_identifier" placeholder={loginExample} autoComplete="off" /></label>
        <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} name="superinfra_login_password" placeholder="Digite sua senha" autoComplete="new-password" /></label>
        {error && <div className="alert danger">{error}</div>}
        <button disabled={loading}>{loading ? 'Entrando...' : 'Acessar sistema'}</button>
        <a className="android-download-link" href="/SuperInfra-Android.apk" download>
          <span aria-hidden="true">🤖</span> Baixar aplicativo para Android
        </a>
      </form>
    </div>
  );
}
