import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import AboutJob from './pages/AboutJob';
import AboutJobAtlanta from './pages/AboutJobAtlanta';
import AboutSalesJob from './pages/AboutSalesJob';
import SalesJobApplication from './pages/SalesJobApplication';
import SalesChangePassword from './pages/SalesChangePassword';
import PurchaseApparel from './pages/PurchaseApparel';
import ApplicationPortal from './pages/ApplicationPortal';
import BackgroundCheck from './pages/BackgroundCheck';

import AdminBackgroundChecks from './pages/AdminBackgroundChecks';
import ApplicationPreview from './pages/ApplicationPreview';
import OrientationAddress from './pages/OrientationAddress';
import AdminPayrollSettings from './pages/AdminPayrollSettings';
import AdminPayrollDashboard from './pages/AdminPayrollDashboard';
import AdminCommissions from './pages/AdminCommissions';
import AdminSalesOrientation from './pages/AdminSalesOrientation';
import SalesOrientationDashboard from './pages/SalesOrientationDashboard';
import SubmitReferences from './pages/SubmitReferences';
import SalesPerformanceDashboard from './pages/SalesPerformanceDashboard';
import OwnerDashboard from './pages/OwnerDashboard';
import EmployeeProfile from './pages/EmployeeProfile';
import Recordings from './pages/Recordings';
import KhethaIQ from './pages/KhethaIQ';
import TimeOff from './pages/TimeOff';
import Benefits from './pages/Benefits';
import PayoutRecords from './pages/PayoutRecords';
import AdminSyncStatus from './pages/AdminSyncStatus';
import AdminManifestConvergence from './pages/AdminManifestConvergence';
import EstateMediaAuthorityConsole from './pages/EstateMediaAuthorityConsole';
import AdminPlatformAccess from './pages/AdminPlatformAccess';
import SalesTrainingPortal from './pages/SalesTrainingPortal';
import SalesTrainingAdmin from './pages/SalesTrainingAdmin';
import FieldProspectingPage from './pages/FieldProspectingPage';
import DiscountApprovalPage from './pages/DiscountApprovalPage';
import ReferralProgramPage from './pages/ReferralProgramPage';
import CustomerSuccessPage from './pages/CustomerSuccessPage';
import EmailPreview from './pages/EmailPreview';
import AsyncInterview from './pages/AsyncInterview';
import AsyncInterviewManager from './pages/AsyncInterviewManager';
import EditingQueuePage from './pages/EditingQueuePage';
import EditorWorkspace from './pages/EditorWorkspace';
import JobDetail from './pages/JobDetail';
import CareersHub from './pages/CareersHub';
import PublicJobPage from './pages/PublicJobPage';
import PublicJobApplication from './pages/PublicJobApplication';

import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ErrorBoundary from '@/components/ErrorBoundary';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    // NOTE: This app uses custom auth (SalesLogin) — do NOT redirect to
    // Base44's hosted login page on 'auth_required'. Just render the Routes
    // so the user can reach SalesLogin. Each page handles its own auth.
  }

  // Render the main app
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route
        path="/MediaSpecialist"
        element={
          <LayoutWrapper currentPageName="MediaSpecialist">
            <AboutJob />
          </LayoutWrapper>
        }
      />
      <Route
        path="/MediaSpecialistAtl"
        element={
          <LayoutWrapper currentPageName="MediaSpecialistAtl">
            <AboutJobAtlanta />
          </LayoutWrapper>
        }
      />
      <Route
        path="/SalesGrowthAdvisor"
        element={
          <LayoutWrapper currentPageName="SalesGrowthAdvisor">
            <AboutSalesJob />
          </LayoutWrapper>
        }
      />
      <Route
        path="/SalesJobApplication"
        element={
          <LayoutWrapper currentPageName="SalesJobApplication">
            <SalesJobApplication />
          </LayoutWrapper>
        }
      />
      <Route
        path="/SalesChangePassword"
        element={
          <LayoutWrapper currentPageName="SalesChangePassword">
            <SalesChangePassword />
          </LayoutWrapper>
        }
      />
      <Route
        path="/PurchaseApparel"
        element={
          <LayoutWrapper currentPageName="PurchaseApparel">
            <PurchaseApparel />
          </LayoutWrapper>
        }
      />
      <Route
        path="/ApplicationPortal"
        element={
          <LayoutWrapper currentPageName="ApplicationPortal">
            <ApplicationPortal />
          </LayoutWrapper>
        }
      />
      <Route
        path="/BackgroundCheck"
        element={
          <LayoutWrapper currentPageName="BackgroundCheck">
            <BackgroundCheck />
          </LayoutWrapper>
        }
      />
      <Route
        path="/AdminBackgroundChecks"
        element={
          <LayoutWrapper currentPageName="AdminBackgroundChecks">
            <AdminBackgroundChecks />
          </LayoutWrapper>
        }
      />
      <Route
        path="/ApplicationPreview"
        element={
          <LayoutWrapper currentPageName="ApplicationPreview">
            <ApplicationPreview />
          </LayoutWrapper>
        }
      />
      <Route
        path="/OrientationAddress"
        element={
          <LayoutWrapper currentPageName="OrientationAddress">
            <OrientationAddress />
          </LayoutWrapper>
        }
      />
      <Route
        path="/AdminPayrollSettings"
        element={
          <LayoutWrapper currentPageName="AdminPayrollSettings">
            <AdminPayrollSettings />
          </LayoutWrapper>
        }
      />
      <Route
        path="/AdminPayrollDashboard"
        element={
          <LayoutWrapper currentPageName="AdminPayrollDashboard">
            <AdminPayrollDashboard />
          </LayoutWrapper>
        }
      />
      <Route
        path="/AdminCommissions"
        element={
          <LayoutWrapper currentPageName="AdminCommissions">
            <AdminCommissions />
          </LayoutWrapper>
        }
      />
      <Route
        path="/AdminSalesOrientation"
        element={
          <LayoutWrapper currentPageName="AdminSalesOrientation">
            <AdminSalesOrientation />
          </LayoutWrapper>
        }
      />
      <Route
        path="/SalesOrientationDashboard"
        element={
          <LayoutWrapper currentPageName="SalesOrientationDashboard">
            <SalesOrientationDashboard />
          </LayoutWrapper>
        }
      />
      <Route
        path="/SubmitReferences"
        element={<SubmitReferences />}
      />
      <Route
        path="/SalesPerformanceDashboard"
        element={
          <LayoutWrapper currentPageName="SalesPerformanceDashboard">
            <SalesPerformanceDashboard />
          </LayoutWrapper>
        }
      />
      <Route
        path="/OwnerDashboard"
        element={
          <LayoutWrapper currentPageName="OwnerDashboard">
            <OwnerDashboard />
          </LayoutWrapper>
        }
      />
      <Route
        path="/EmployeeProfile"
        element={
          <LayoutWrapper currentPageName="EmployeeProfile">
            <EmployeeProfile />
          </LayoutWrapper>
        }
      />
      <Route
        path="/Recordings"
        element={
          <LayoutWrapper currentPageName="Recordings">
            <Recordings />
          </LayoutWrapper>
        }
      />
      <Route
        path="/KhethaIQ"
        element={
          <LayoutWrapper currentPageName="KhethaIQ">
            <KhethaIQ />
          </LayoutWrapper>
        }
      />
      <Route
        path="/TimeOff"
        element={
          <LayoutWrapper currentPageName="TimeOff">
            <TimeOff />
          </LayoutWrapper>
        }
      />
      <Route
        path="/Benefits"
        element={
          <LayoutWrapper currentPageName="Benefits">
            <Benefits />
          </LayoutWrapper>
        }
      />
      <Route
        path="/PayoutRecords"
        element={
          <LayoutWrapper currentPageName="PayoutRecords">
            <PayoutRecords />
          </LayoutWrapper>
        }
      />
      <Route
        path="/AdminSyncStatus"
        element={
          <LayoutWrapper currentPageName="AdminSyncStatus">
            <AdminSyncStatus />
          </LayoutWrapper>
        }
      />
      <Route
        path="/AdminManifestConvergence"
        element={
          <LayoutWrapper currentPageName="AdminManifestConvergence">
            <AdminManifestConvergence />
          </LayoutWrapper>
        }
      />
      <Route
        path="/EstateMediaAuthorityConsole"
        element={
          <LayoutWrapper currentPageName="EstateMediaAuthorityConsole">
            <EstateMediaAuthorityConsole />
          </LayoutWrapper>
        }
      />
      <Route
        path="/AdminPlatformAccess"
        element={
          <LayoutWrapper currentPageName="AdminPlatformAccess">
            <AdminPlatformAccess />
          </LayoutWrapper>
        }
      />
      <Route
        path="/SalesTrainingPortal"
        element={
          <LayoutWrapper currentPageName="SalesTrainingPortal">
            <SalesTrainingPortal />
          </LayoutWrapper>
        }
      />
      <Route
        path="/SalesTrainingAdmin"
        element={
          <LayoutWrapper currentPageName="SalesTrainingAdmin">
            <SalesTrainingAdmin />
          </LayoutWrapper>
        }
      />
      <Route
        path="/FieldProspectingPage"
        element={
          <LayoutWrapper currentPageName="FieldProspectingPage">
            <FieldProspectingPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/DiscountApprovalPage"
        element={
          <LayoutWrapper currentPageName="DiscountApprovalPage">
            <DiscountApprovalPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/ReferralProgramPage"
        element={
          <LayoutWrapper currentPageName="ReferralProgramPage">
            <ReferralProgramPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/CustomerSuccessPage"
        element={
          <LayoutWrapper currentPageName="CustomerSuccessPage">
            <CustomerSuccessPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/EmailPreview"
        element={
          <LayoutWrapper currentPageName="EmailPreview">
            <EmailPreview />
          </LayoutWrapper>
        }
      />
      <Route
        path="/AsyncInterview"
        element={<AsyncInterview />}
      />
      <Route
        path="/AsyncInterviewManager"
        element={
          <LayoutWrapper currentPageName="AsyncInterviewManager">
            <AsyncInterviewManager />
          </LayoutWrapper>
        }
      />
      <Route
        path="/EditingQueuePage"
        element={
          <LayoutWrapper currentPageName="EditingQueuePage">
            <EditingQueuePage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/EditorWorkspace"
        element={
          <LayoutWrapper currentPageName="EditorWorkspace">
            <EditorWorkspace />
          </LayoutWrapper>
        }
      />
      <Route
        path="/JobDetail"
        element={
          <LayoutWrapper currentPageName="JobDetail">
            <JobDetail />
          </LayoutWrapper>
        }
      />
      <Route
        path="/careers/company/:companySlug"
        element={<CareersHub />}
      />
      <Route
        path="/careers"
        element={<CareersHub />}
      />
      <Route
        path="/careers/:jobId/apply"
        element={<PublicJobApplication />}
      />
      <Route
        path="/careers/:jobId"
        element={<PublicJobPage />}
      />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </ErrorBoundary>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App