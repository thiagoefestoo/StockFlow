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
import Warehouses from './pages/Warehouses';
import SerialLife from './pages/SerialLife';


export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Home />} />
            <Route path="dashboard" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><Dashboard /></PrivateRoute>} />
            <Route path="estoque" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><Stock /></PrivateRoute>} />
            <Route path="entrada" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><Receiving /></PrivateRoute>} />
            <Route path="transferencias" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><Transfers /></PrivateRoute>} />
            <Route path="solicitacoes-material" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><MaterialRequests /></PrivateRoute>} />
            <Route path="aprovacoes" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><Approvals /></PrivateRoute>} />
            <Route path="transferencias/:id" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><TransferPrint /></PrivateRoute>} />
            <Route path="portal-tecnico" element={<PrivateRoute roles={['tecnico', 'admin', 'supervisor', 'estoquista']}><TechnicianPortal /></PrivateRoute>} />
            <Route path="caixa-tecnico" element={<PrivateRoute roles={['tecnico', 'admin', 'supervisor', 'estoquista']}><TechnicianInbox /></PrivateRoute>} />
            <Route path="central-caixa-tecnico" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><TechnicianBoxControl /></PrivateRoute>} />
            <Route path="tecnicos" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><Technicians /></PrivateRoute>} />
            <Route path="usuarios" element={<PrivateRoute roles={['admin']}><Users /></PrivateRoute>} />
            <Route path="minha-conta" element={<Account />} />
            <Route path="os" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><ServiceOrders /></PrivateRoute>} />
            <Route path="estoques-regionais" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><Warehouses /></PrivateRoute>} />
            <Route path="vida-serial" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista', 'tecnico']}><SerialLife /></PrivateRoute>} />
            <Route path="patrimonio" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><Patrimony /></PrivateRoute>} />
            <Route path="bi/executivo" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><BIExecutive /></PrivateRoute>} />
            <Route path="bi/tecnicos" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><BITechnicians /></PrivateRoute>} />
            <Route path="bi/auditoria" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><BIAudit /></PrivateRoute>} />
            <Route path="bi/financeiro" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><BIFinancial /></PrivateRoute>} />
            <Route path="auditoria" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><Audit /></PrivateRoute>} />
            <Route path="historico-movimentacoes" element={<PrivateRoute roles={['admin', 'supervisor', 'estoquista']}><MovementHistory /></PrivateRoute>} />
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
