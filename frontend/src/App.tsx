import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { SocketProvider } from './context/SocketContext.tsx';
import { DashboardLayout } from './layouts/DashboardLayout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { JobSubmissionPage } from './pages/JobSubmissionPage.tsx';
import { JobMonitorPage } from './pages/JobMonitorPage.tsx';
import { JobDetailsPage } from './pages/JobDetailsPage.tsx';
import { WorkerMonitorPage } from './pages/WorkerMonitorPage.tsx';
import { ResultsPage } from './pages/ResultsPage.tsx';
import { AnalyticsPage } from './pages/AnalyticsPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAdmin?: boolean }> = ({ 
  children, 
  requireAdmin = false 
}) => {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/overview" replace />;
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route path="/" element={<Navigate to="/overview" replace />} />

            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/submit" element={<JobSubmissionPage />} />
              <Route path="/jobs" element={<JobMonitorPage />} />
              <Route path="/jobs/:id" element={<JobDetailsPage />} />
              <Route path="/workers" element={<WorkerMonitorPage />} />
              <Route path="/results" element={<ResultsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminPage />
                  </ProtectedRoute>
                } 
              />
            </Route>

            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
};
