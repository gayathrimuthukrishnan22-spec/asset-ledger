// ======================================================
// File Name : App.jsx
// Purpose   : Implements App
// ======================================================

import { Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './pages/Auth/Login';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { AssetRegister } from './pages/Assets/AssetRegister';
import { AssetDetail } from './pages/Assets/AssetDetail';
import { LifecycleEvents } from './pages/Lifecycle/LifecycleEvents';
import { BulkImport } from './pages/Lifecycle/BulkImport';
import { ServiceApiTest } from './pages/Lifecycle/ServiceApiTest';
import { SapIntegration } from './pages/Integrations/SapIntegration';
import { Modeling } from './pages/Planning/Modeling';
import { Forecasting } from './pages/Planning/Forecasting';
import { Reporting } from './pages/Compliance/Reporting';
import { Pub946Tables } from './pages/Configuration/Pub946Tables';
import { BonusDepreciation } from './pages/Configuration/BonusDepreciation';
import { AssetClasses } from './pages/Configuration/AssetClasses';
import { BooksList } from './pages/Configuration/BooksList';
import { Users } from './pages/Administration/Users';
import { RequireView } from './context/RequireView';
import { ProtectedRoute } from './context/ProtectedRoute';

// ======================================================
// START: App Functions
// ======================================================

// ======================================================
// Function : App
// Purpose  : React component that renders the 'App' UI
// ======================================================

// Every route below except /login is now wrapped in <ProtectedRoute> —
// no session in sessionStorage means straight to /login instead of the
// old "usable without signing in" default. RequireView (per-menu Page
// Access) still runs after that, same as before.
export default function App() {
    return (<Routes>
      <Route path="/login" element={<Login />}/>
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}/>
      <Route path="/assets" element={<ProtectedRoute><RequireView menuId="assets"><AssetRegister /></RequireView></ProtectedRoute>}/>
      <Route path="/assets/new" element={<Navigate to="/lifecycle?type=addition" replace/>}/>
      <Route path="/assets/:assetNumber" element={<ProtectedRoute><RequireView menuId="detail"><AssetDetail /></RequireView></ProtectedRoute>}/>
      <Route path="/lifecycle" element={<ProtectedRoute><RequireView menuId="lifecycle"><LifecycleEvents /></RequireView></ProtectedRoute>}/>
      <Route path="/lifecycle/bulk-import" element={<ProtectedRoute><RequireView menuId="bulk-import"><BulkImport /></RequireView></ProtectedRoute>}/>
      <Route path="/lifecycle/service-api" element={<ProtectedRoute><RequireView menuId="bulk-import"><ServiceApiTest /></RequireView></ProtectedRoute>}/>
      <Route path="/integrations/sap" element={<ProtectedRoute><RequireView menuId="sap"><SapIntegration /></RequireView></ProtectedRoute>}/>
      <Route path="/modeling" element={<ProtectedRoute><RequireView menuId="modeling"><Modeling /></RequireView></ProtectedRoute>}/>
      <Route path="/forecasting" element={<ProtectedRoute><RequireView menuId="forecasting"><Forecasting /></RequireView></ProtectedRoute>}/>
      <Route path="/reporting" element={<ProtectedRoute><RequireView menuId="reporting"><Reporting /></RequireView></ProtectedRoute>}/>
      <Route path="/configuration/pub946" element={<ProtectedRoute><RequireView menuId="pub946"><Pub946Tables /></RequireView></ProtectedRoute>}/>
      <Route path="/configuration/bonus-depreciation" element={<ProtectedRoute><RequireView menuId="bonus"><BonusDepreciation /></RequireView></ProtectedRoute>}/>
      <Route path="/configuration/asset-classes" element={<ProtectedRoute><RequireView menuId="assetClasses"><AssetClasses /></RequireView></ProtectedRoute>}/>
      <Route path="/configuration/books" element={<ProtectedRoute><RequireView menuId="books"><BooksList /></RequireView></ProtectedRoute>}/>
      <Route path="/users" element={<ProtectedRoute><RequireView menuId="users"><Users /></RequireView></ProtectedRoute>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>);
}

// ======================================================
// END: App
// ======================================================

// ======================================================
// END: App Functions
// ======================================================

// ======================================================
// END OF FILE : App.jsx
// ======================================================
