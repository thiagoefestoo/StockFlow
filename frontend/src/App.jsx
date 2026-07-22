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
import TechnicianLosses from './pages/TechnicianLosses';
import LossPrint from './pages/LossPrint';
import TechnicianReturns from './pages/TechnicianReturns';
import LossEvaluation from './pages/LossEvaluation';


export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Home />} />
            <Route path="dashboard" element={<PrivateRoute module="operationsCockpit"><Dashboard /></PrivateRoute>} />
            <Route path="estoque" element={<PrivateRoute module="stock"><Stock /></PrivateRoute>} />
            <Route path="entrada" element={<PrivateRoute module="receiving"><Receiving /></PrivateRoute>} />
            <Route path="transferencias" element={<PrivateRoute module="transfers"><Transfers /></PrivateRoute>} />
            <Route path="solicitacoes-material" element={<PrivateRoute module="materialRequests"><MaterialRequests /></PrivateRoute>} />
            <Route path="aprovacoes" element={<PrivateRoute module="approvals"><Approvals /></PrivateRoute>} />
            <Route path="transferencias/:id" element={<PrivateRoute module="transfers"><TransferPrint /></PrivateRoute>} />
            <Route path="perdas-tecnico" element={<PrivateRoute module="technicianLosses"><TechnicianLosses /></PrivateRoute>} />
            <Route path="perdas-tecnico/:id" element={<PrivateRoute module="technicianLosses"><LossPrint /></PrivateRoute>} />
            <Route path="portal-tecnico" element={<PrivateRoute module="technicianInbox"><TechnicianPortal /></PrivateRoute>} />
            <Route path="caixa-tecnico" element={<PrivateRoute module="technicianInbox"><TechnicianInbox /></PrivateRoute>} />
            <Route path="central-caixa-tecnico" element={<PrivateRoute module="technicianBoxControl"><TechnicianBoxControl /></PrivateRoute>} />
            <Route path="retorno-caixa-estoque" element={<PrivateRoute module="technicianReturns"><TechnicianReturns /></PrivateRoute>} />
            <Route path="tecnicos" element={<PrivateRoute module="technicians"><Technicians /></PrivateRoute>} />
            <Route path="usuarios" element={<PrivateRoute roles={['admin']} module="users"><Users /></PrivateRoute>} />
            <Route path="minha-conta" element={<Account />} />
            <Route path="os" element={<PrivateRoute module="serviceOrders"><ServiceOrders /></PrivateRoute>} />
            <Route path="estoques-regionais" element={<PrivateRoute module="warehouses"><Warehouses /></PrivateRoute>} />
            <Route path="vida-serial" element={<PrivateRoute module="serialLife"><SerialLife /></PrivateRoute>} />
            <Route path="patrimonio" element={<PrivateRoute module="patrimony"><Patrimony /></PrivateRoute>} />
            <Route path="bi/executivo" element={<PrivateRoute module="biExecutive"><BIExecutive /></PrivateRoute>} />
            <Route path="bi/tecnicos" element={<PrivateRoute module="biTechnicians"><BITechnicians /></PrivateRoute>} />
            <Route path="bi/auditoria" element={<PrivateRoute module="biAudit"><BIAudit /></PrivateRoute>} />
            <Route path="avaliacao-perdas" element={<PrivateRoute module="lossEvaluation"><LossEvaluation /></PrivateRoute>} />
            <Route path="bi/financeiro" element={<PrivateRoute module="biFinancial"><BIFinancial /></PrivateRoute>} />
            <Route path="auditoria" element={<PrivateRoute module="audit"><Audit /></PrivateRoute>} />
            <Route path="historico-movimentacoes" element={<PrivateRoute module="movementHistory"><MovementHistory /></PrivateRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function Home() {
  const { canAccessModule, firstAllowedRoute } = useAuth();
  if (canAccessModule('operationsCockpit')) return <OperationsCockpit />;
  return <Navigate to={firstAllowedRoute()} replace />;
}
