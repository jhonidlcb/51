import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./lib/queryClient";
import { useAuth } from "./hooks/useAuth";
import Layout from "@/components/Layout";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminProjectManagement from "@/pages/admin/ProjectManagement";
import AdminSupportAdministration from "@/pages/admin/SupportAdministration";
import AdminUserManagement from "@/pages/admin/UserManagement";
import AdminPartnerManagement from "@/pages/admin/PartnerManagement";
import AnalyticsDashboard from "@/pages/admin/AnalyticsDashboard";
import ClientDashboard from "@/pages/ClientDashboard";
import PartnerDashboard from "@/pages/PartnerDashboard";
import PortfolioAdmin from "@/pages/PortfolioAdmin";
import ProjectsManagement from "@/pages/client/ProjectsManagement";
import SupportCenter from "@/pages/client/SupportCenter";
import BillingDashboard from "@/pages/client/BillingDashboard";
import EarningsManagement from "@/pages/partner/EarningsManagement";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import CookiePolicy from "./pages/CookiePolicy";
import NotFound from "@/pages/not-found";
import { lazy } from "react";
import WorkModalitiesManagement from "@/pages/admin/WorkModalitiesManagement";
import InvoiceManagement from "@/pages/admin/InvoiceManagement";
import CompanyBillingInfo from "@/pages/admin/CompanyBillingInfo";
// Import the new BillingInformation component
import BillingInformation from "@/pages/client/BillingInformation";
// Import the new ExchangeRateAdmin page
import ExchangeRateAdmin from "@/pages/admin/ExchangeRateAdmin";
// Import the ResetPassword page
import ResetPassword from "@/pages/ResetPassword";
// Import the LegalPagesManagement page
import LegalPagesManagement from "./pages/admin/LegalPagesManagement";
// Import the HeroSlidesManagement page
import HeroSlidesManagement from "./pages/admin/HeroSlidesManagement";

// Placeholder for ProtectedRoute component, assuming it exists and handles role-based access
// If ProtectedRoute is not defined elsewhere, it would need to be imported or defined.
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  if (!user || !allowedRoles.includes(user.role)) {
    // Redirect to login or appropriate page if not authenticated or not authorized
    // For simplicity, returning null or a loading indicator here, but ideally would redirect.
    return <div>Access Denied</div>;
  }
  return children;
};


function Router() {
  const { user, isLoading, error, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Clear invalid tokens and handle reCAPTCHA issues if any
  if (error && localStorage.getItem("auth_token")) {
    // Assuming the error might be related to authentication or token expiration
    // A more robust error handling strategy might be needed depending on the specific error
    localStorage.removeItem("auth_token");
    // Consider a more graceful way to handle re-authentication or inform the user
    // window.location.reload(); // Reloading might not always be the best UX
    // For now, we'll keep the reload as per original logic if an error occurs and token exists.
    window.location.reload();
    return null;
  }

  return (
    <Switch>
      {/* Legal pages with Layout - MUST be before other routes */}
      <Route path="/terminos" component={TermsOfService} />
      <Route path="/privacidad" component={PrivacyPolicy} />
      <Route path="/cookies" component={CookiePolicy} />

      {/* Password reset page - public route */}
      <Route path="/reset-password" component={ResetPassword} />

      {/* Admin routes - NO Layout (they use DashboardLayout) */}
      <Route path="/admin/portfolio" component={() => <PortfolioAdmin />} />
      {/* New route for Exchange Rate configuration */}
      <Route path="/admin/exchange-rate" component={() => <ExchangeRateAdmin />} />
      {/* Route for Work Modalities Management */}
      <Route path="/admin/work-modalities" component={WorkModalitiesManagement} />
      {/* New route for Hero Slides Management */}
      <Route path="/admin/hero-slides" component={HeroSlidesManagement} />
      {/* New route for Legal Pages Management */}
      <Route path="/admin/legal-pages" component={LegalPagesManagement} />
      <Route path="/admin/analytics" component={() => <AnalyticsDashboard />} />
      <Route path="/admin/projects" component={AdminProjectManagement} />
      <Route path="/admin/support" component={AdminSupportAdministration} />
      <Route path="/admin/users" component={AdminUserManagement} />
      <Route path="/admin/partners" component={AdminPartnerManagement} />
      <Route path="/admin/invoices" component={() => <InvoiceManagement />} />
      <Route path="/admin/company-billing" component={() => <CompanyBillingInfo />} />
      <Route path="/admin" component={AdminDashboard} />

      {/* Client routes - NO Layout (they use DashboardLayout) */}
      <Route path="/client/projects" component={ProjectsManagement} />
      <Route path="/client/support" component={SupportCenter} />
      {/* Updated billing routes */}
      <Route path="/client/billing" component={BillingDashboard} />
      <Route path="/client/billing-info" component={BillingInformation} />
      <Route path="/client" component={ClientDashboard} />

      {/* Partner routes - NO Layout (they use DashboardLayout) */}
      <Route path="/partner/earnings" component={EarningsManagement} />
      <Route path="/partner" component={PartnerDashboard} />

      {/* Home page - MUST be last specific route */}
      {!user ? (
        <Route path="/" component={Landing} />
      ) : (
        <Route path="/" component={Dashboard} />
      )}

      {/* 404 fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen">
          <Router />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;