import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UploadReport from './pages/UploadReport';
import KnowledgeGraph from './pages/KnowledgeGraph';

// Optional route guard for authenticated views
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 1. Login Page */}
        <Route path="/" element={<Login />} />

        {/* 2. Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* 3. Upload Report */}
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <UploadReport />
            </ProtectedRoute>
          }
        />

        {/* 4. Knowledge Graph */}
        <Route
          path="/graph"
          element={
            <ProtectedRoute>
              <KnowledgeGraph />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
