import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Stock from './pages/Stock';
import Receiving from './pages/Receiving';
import Transfers from './pages/Transfers';
import TransferPrint from './pages/TransferPrint';
import TechnicianPortal from './pages/TechnicianPortal';
import Technicians from './pages/Technicians';
import ServiceOrders from './pages/ServiceOrders';
import Patrimony from './pages/Patrimony';
import BIExecutive from './pages/BIExecutive';
import BITechnicians from './pages/BITechnicians';
import BIAudit from './pages/BIAudit';
import BIFinancial from './pages/BIFinancial';
import Audit from './pages/Audit';
import Approvals from './pages/Approvals';
import MaterialRequests from './pages/MaterialRequests';
import TechnicianInbox from './pages/TechnicianInbox';
import TechnicianBoxControl from './pages/TechnicianBoxControl';
import OperationsCockpit from './pages/OperationsCockpit';
import MovementHistory from './pages/MovementHistory';
import Users from './pages/Users';
import Account from './pages/Account';


export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Home />} />
            <Route path="dashboard" element={<PrivateRoute roles={['admin', 'supervisor']}><Dashboard /></PrivateRoute>} />
            <Route path="estoque" element={<PrivateRoute roles={['admin', 'supervisor']}><Stock /></PrivateRoute>} />
            <Route path="entrada" element={<PrivateRoute roles={['admin', 'supervisor']}><Receiving /></PrivateRoute>} />
            <Route path="transferencias" element={<PrivateRoute roles={['admin', 'supervisor']}><Transfers /></PrivateRoute>} />
            <Route path="solicitacoes-material" element={<PrivateRoute roles={['admin', 'supervisor']}><MaterialRequests /></PrivateRoute>} />
            <Route path="aprovacoes" element={<PrivateRoute roles={['admin', 'supervisor']}><Approvals /></PrivateRoute>} />
            <Route path="transferencias/:id" element={<PrivateRoute roles={['admin', 'supervisor']}><TransferPrint /></PrivateRoute>} />
            <Route path="portal-tecnico" element={<PrivateRoute roles={['tecnico', 'admin', 'supervisor']}><TechnicianPortal /></PrivateRoute>} />
            <Route path="caixa-tecnico" element={<PrivateRoute roles={['tecnico', 'admin', 'supervisor']}><TechnicianInbox /></PrivateRoute>} />
            <Route path="central-caixa-tecnico" element={<PrivateRoute roles={['admin', 'supervisor']}><TechnicianBoxControl /></PrivateRoute>} />
            <Route path="tecnicos" element={<PrivateRoute roles={['admin', 'supervisor']}><Technicians /></PrivateRoute>} />
            <Route path="usuarios" element={<PrivateRoute roles={['admin']}><Users /></PrivateRoute>} />
            <Route path="minha-conta" element={<Account />} />
            <Route path="os" element={<PrivateRoute roles={['admin', 'supervisor']}><ServiceOrders /></PrivateRoute>} />
            <Route path="patrimonio" element={<PrivateRoute roles={['admin', 'supervisor']}><Patrimony /></PrivateRoute>} />
            <Route path="bi/executivo" element={<PrivateRoute roles={['admin', 'supervisor']}><BIExecutive /></PrivateRoute>} />
            <Route path="bi/tecnicos" element={<PrivateRoute roles={['admin', 'supervisor']}><BITechnicians /></PrivateRoute>} />
            <Route path="bi/auditoria" element={<PrivateRoute roles={['admin', 'supervisor']}><BIAudit /></PrivateRoute>} />
            <Route path="bi/financeiro" element={<PrivateRoute roles={['admin', 'supervisor']}><BIFinancial /></PrivateRoute>} />
            <Route path="auditoria" element={<PrivateRoute roles={['admin', 'supervisor']}><Audit /></PrivateRoute>} />
            <Route path="historico-movimentacoes" element={<PrivateRoute roles={['admin', 'supervisor']}><MovementHistory /></PrivateRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function Home() {
  const { isSupervisor } = useAuth();
  return isSupervisor ? <OperationsCockpit /> : <Navigate to="/caixa-tecnico" replace />;
}
