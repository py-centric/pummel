/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { PummelProvider } from './context/PummelContext';
import { LayoutShell } from './components/LayoutShell';
import { ClusterOverviewPage } from './pages/ClusterOverviewPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { CompliancePage } from './pages/CompliancePage';
import { FacilitiesPage } from './pages/FacilitiesPage';

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <PummelProvider>
          <LayoutShell>
            <Routes>
              <Route path="/" element={<ClusterOverviewPage />} />
              <Route path="/workspace" element={<WorkspacePage />} />
              <Route path="/compliance" element={<CompliancePage />} />
              <Route path="/facilities" element={<FacilitiesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </LayoutShell>
        </PummelProvider>
      </HashRouter>
    </ThemeProvider>
  );
}
