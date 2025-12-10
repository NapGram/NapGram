import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { MergedMessageViewer } from '@/components/MergedMessageViewer';
import { ChatRecordViewer } from '@/components/ChatRecordViewer';
import { AuthProvider } from '@/lib/auth';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Dashboard } from '@/pages/admin/Dashboard';
import { PairManagement } from '@/pages/admin/PairManagement';

function ViewerWrapper() {
  const { uuid } = useParams();
  if (!uuid) return <div>No UUID provided</div>;
  return <MergedMessageViewer uuid={uuid} />;
}

function QueryViewerWrapper() {
  const [params] = useSearchParams();
  const uuid = params.get('tgWebAppStartParam') || params.get('uuid') || params.get('id');
  if (!uuid) return <div className="p-4 text-red-500">Missing uuid</div>;
  return <MergedMessageViewer uuid={uuid} />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/ui">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Legacy routes */}
          <Route path="/chatRecord" element={<QueryViewerWrapper />} />
          <Route path="/merged/:uuid" element={<ViewerWrapper />} />
          <Route path="/records" element={<ChatRecordViewer />} />

          {/* Admin routes (protected) */}
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="pairs" element={<PairManagement />} />
            {/* Other admin routes will be added in future phases */}
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/admin" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
