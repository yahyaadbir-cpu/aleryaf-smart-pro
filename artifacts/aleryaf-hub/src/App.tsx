import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setCsrfTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/auth";
import NotFound from "@/pages/not-found";

import { Dashboard } from "@/pages/dashboard";
import { BranchAnalytics } from "@/pages/branch-analytics";
import { ProfitAnalysisPage } from "@/pages/profit";
import { ReportsPage } from "@/pages/reports";
import { InventoryPage } from "@/pages/inventory";
import { ItemsPage } from "@/pages/items";
import { InvoicesPage } from "@/pages/invoices";
import { InvoiceDxPage } from "@/pages/invoice-dx";
import { InvoicePrintPage } from "@/pages/invoice-print";
import { BranchesPage } from "@/pages/branches";
import { LoginPage } from "@/pages/login";
import { AdminLogPage } from "@/pages/admin-log";
import { AdminControlPage } from "@/pages/admin-control";
import { AdminUsersPage } from "@/pages/admin-users";
import { AdminHandbookPage } from "@/pages/admin-handbook";
import { syncExistingPushSubscription, unregisterPushSubscription } from "@/lib/push-notifications";
import { getCsrfToken } from "@/lib/http";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

setCsrfTokenGetter(() => getCsrfToken());

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }
  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!user.isAdmin) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function NotificationManager() {
  const { user, ready } = useAuth();

  React.useEffect(() => {
    if (!ready) return;

    if (user) {
      syncExistingPushSubscription(user).catch(() => undefined);
      return;
    }

    unregisterPushSubscription().catch(() => undefined);
  }, [user, ready]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        {() => <AuthGuard><Dashboard /></AuthGuard>}
      </Route>
      <Route path="/branch-analytics">
        {() => <AuthGuard><BranchAnalytics /></AuthGuard>}
      </Route>
      <Route path="/profit">
        {() => <AuthGuard><ProfitAnalysisPage /></AuthGuard>}
      </Route>
      <Route path="/reports">
        {() => <AuthGuard><ReportsPage /></AuthGuard>}
      </Route>
      <Route path="/inventory">
        {() => <AuthGuard><InventoryPage /></AuthGuard>}
      </Route>
      <Route path="/items">
        {() => <AuthGuard><ItemsPage /></AuthGuard>}
      </Route>
      <Route path="/invoices">
        {() => <AuthGuard><InvoicesPage /></AuthGuard>}
      </Route>
      <Route path="/invoices/:id/print">
        {(params) => <AuthGuard><InvoicePrintPage invoiceId={Number(params.id)} /></AuthGuard>}
      </Route>
      <Route path="/invoices/:id/dx">
        {(params) => <AdminGuard><InvoiceDxPage invoiceId={Number(params.id)} /></AdminGuard>}
      </Route>
      <Route path="/branches">
        {() => <AuthGuard><BranchesPage /></AuthGuard>}
      </Route>
      <Route path="/admin-log">
        {() => <AdminGuard><AdminLogPage /></AdminGuard>}
      </Route>
      <Route path="/admin-control">
        {() => <AdminGuard><AdminControlPage /></AdminGuard>}
      </Route>
      <Route path="/admin-users">
        {() => <AdminGuard><AdminUsersPage /></AdminGuard>}
      </Route>
      <Route path="/admin-handbook">
        {() => <AdminGuard><AdminHandbookPage /></AdminGuard>}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <NotificationManager />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
