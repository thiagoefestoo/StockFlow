import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import KpiCard from '../components/KpiCard';

function formatDate(value) {
  if (!value) return 'Não registrado';
  return new Date(value).toLocaleString('pt-BR');
}

function roleLabel(role) {
  const labels = { admin: 'Administrador', supervisor: 'Supervisor', tecnico: 'Técnico' };
  return labels[role] || role || '-';
}

function accessLabel(user) {
  if (user?.accessStatus === 'bloqueado') return 'Bloqueado';
  if (user?.accessStatus === 'excluido') return 'Excluído';
  if (user?.status === 'inativo') return 'Inativo';
  return 'Ativo';
}

export default function Account() {
  const { user, updateUser, refreshUser } = useAuth();
  const [profile, setProfile] = useState({ name: '', email: '', phone: '', jobTitle: '', notes: '' });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState(null);
  const [freshUser, setFreshUser] = useState(user);

  useEffect(() => {
    const next = freshUser || user || {};
    setProfile({
      name: next.name || '',
      email: next.email || '',
      phone: next.phone || '',
      jobTitle: next.jobTitle || '',
      notes: next.notes || '',
    });
  }, [user, freshUser]);

  useEffect(() => {
    refreshUser().then(setFreshUser).catch(() => setFreshUser(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const securityScore = useMemo(() => {
    let score = 65;
    if (freshUser?.phone) score += 10;
    if (freshUser?.jobTitle) score += 5;
    if (freshUser?.passwordChangedAt) score += 10;
    if (!freshUser?.mustChangePassword) score += 10;
    return Math.min(score, 100);
  }, [freshUser]);

  async function saveProfile(event) {
    event.preventDefault();
    setSavingProfile(true);
    setMessage(null);
    try {
      const { data } = await api.put('/auth/me', profile);
      updateUser(data.data.user);
      setFreshUser(data.data.user);
      setMessage({ type: 'success', text: data.message || 'Conta atualizada com sucesso.' });
    } catch (error) {
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Não foi possível atualizar a conta.' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setSavingPassword(true);
    setMessage(null);
    try {
      const { data } = await api.patch('/auth/me/password', password);
      updateUser(data.data.user);
      setFreshUser(data.data.user);
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage({ type: 'success', text: data.message || 'Senha alterada com sucesso.' });
    } catch (error) {
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Não foi possível alterar a senha.' });
    } finally {
      setSavingPassword(false);
    }
  }

  const current = freshUser || user || {};

  return (
    <div className="page-grid account-page executive-page">
      <section className="finance-hero account-hero">
        <div>
          <span className="eyebrow">👤 Área do usuário</span>
          <h2>Minha conta e segurança</h2>
          <p>Atualize seus dados, confira seu perfil de acesso, acompanhe informações da sessão e altere sua senha sem depender do administrador.</p>
        </div>
        <div className="account-hero-card">
          <div className="account-avatar">{String(current.name || 'U').charAt(0).toUpperCase()}</div>
          <strong>{current.name}</strong>
          <span>{roleLabel(current.role)} • {accessLabel(current)}</span>
        </div>
      </section>

      {message && <div className={`alert ${message.type}`}>{message.text}</div>}

      <section className="kpi-grid account-kpis">
        <KpiCard label="Perfil" value={roleLabel(current.role)} hint="Permissão aplicada ao menu e rotas." />
        <KpiCard label="Status" value={accessLabel(current)} hint="Situação da conta no sistema." tone={current.status === 'ativo' ? 'success' : 'warning'} />
        <KpiCard label="Último login" value={formatDate(current.lastLoginAt)} hint="Registro da última entrada." />
        <KpiCard label="Segurança" value={`${securityScore}%`} hint="Completude da conta e senha." tone={securityScore >= 80 ? 'success' : 'warning'} />
      </section>

      <section className="account-grid">
        <form className="panel account-panel" onSubmit={saveProfile}>
          <div className="panel-title">
            <div>
              <h3>📝 Informações da conta</h3>
              <p>Essas informações aparecem no topo do sistema, auditoria e identificação operacional.</p>
            </div>
            <span className="badge role-admin">{roleLabel(current.role)}</span>
          </div>
          <div className="form-grid">
            <label><span>Nome</span><input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label>
            <label><span>E-mail</span><input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></label>
            <label><span>Telefone</span><input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="(00) 00000-0000" /></label>
            <label><span>Cargo/função</span><input value={profile.jobTitle} onChange={(event) => setProfile({ ...profile, jobTitle: event.target.value })} placeholder="Ex.: Supervisor operacional" /></label>
          </div>
          <label><span>Observações da conta</span><textarea rows="4" value={profile.notes} onChange={(event) => setProfile({ ...profile, notes: event.target.value })} placeholder="Informações internas sobre contato, setor, turno ou observações administrativas." /></label>
          <div className="row-actions">
            <button type="submit" disabled={savingProfile}>{savingProfile ? 'Salvando...' : '💾 Salvar minhas informações'}</button>
          </div>
        </form>

        <form className="panel account-panel security-panel" onSubmit={savePassword}>
          <div className="panel-title">
            <div>
              <h3>🔐 Alterar senha</h3>
              <p>Use uma senha própria, segura e diferente da temporária criada pelo administrador.</p>
            </div>
            <span className={`badge ${current.mustChangePassword ? 'pendente_assinatura' : 'assinado'}`}>{current.mustChangePassword ? 'Troca obrigatória' : 'Senha válida'}</span>
          </div>
          <label><span>Senha atual</span><input type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} required /></label>
          <label><span>Nova senha</span><input type="password" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} minLength="6" required /></label>
          <label><span>Confirmar nova senha</span><input type="password" value={password.confirmPassword} onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })} minLength="6" required /></label>
          <div className="password-strength">
            <div className="bar-track"><i style={{ width: `${Math.min(100, (password.newPassword.length / 12) * 100)}%` }} /></div>
            <small>Use pelo menos 6 caracteres. Para maior segurança, combine letras, números e símbolos.</small>
          </div>
          <div className="row-actions">
            <button type="submit" disabled={savingPassword}>{savingPassword ? 'Alterando...' : '🔑 Alterar senha'}</button>
          </div>
        </form>
      </section>

      <section className="panel account-panel account-audit-summary">
        <div className="panel-title">
          <div>
            <h3>🛡️ Resumo de acesso</h3>
            <p>Informações úteis para conferência, auditoria e suporte.</p>
          </div>
        </div>
        <div className="account-info-grid">
          <article><small>ID do usuário</small><strong>#{current.id}</strong></article>
          <article><small>Conta criada em</small><strong>{formatDate(current.createdAt)}</strong></article>
          <article><small>Senha alterada em</small><strong>{formatDate(current.passwordChangedAt)}</strong></article>
          <article><small>Técnico vinculado</small><strong>{current.technician?.name || (current.technicianId ? `Técnico #${current.technicianId}` : 'Não vinculado')}</strong></article>
          <article><small>Status de acesso</small><strong>{accessLabel(current)}</strong></article>
          <article><small>E-mail de login</small><strong>{current.email}</strong></article>
        </div>
      </section>
    </div>
  );
}
