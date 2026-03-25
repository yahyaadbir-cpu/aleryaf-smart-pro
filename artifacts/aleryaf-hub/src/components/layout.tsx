import { CSSProperties, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { APP_NAME_AR } from "@/lib/branding";
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Box,
  FileText,
  BarChart3,
  Menu,
} from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

const mobileNavItems = [
  { title: "لوحة التحكم", url: "/", icon: LayoutDashboard },
  { title: "الفواتير", url: "/invoices", icon: FileText },
  { title: "المنتجات", url: "/items", icon: Package },
  { title: "المخزون", url: "/inventory", icon: Box },
  { title: "الفروع", url: "/branch-analytics", icon: BarChart3 },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const style: CSSProperties = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <div className="app-shell dark min-h-screen bg-background font-sans text-foreground">
      <SidebarProvider style={style}>
        <div className="app-frame flex w-full overflow-hidden">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="app-topbar z-10 flex shrink-0 items-center justify-between border-b border-white/5 bg-card/50 px-4 backdrop-blur-md">
              <SidebarTrigger className="hidden text-muted-foreground transition-colors hover-elevate hover:text-foreground md:flex" />

              <div className="mr-4 flex items-center gap-2 font-display text-lg font-bold tracking-wide text-primary">
                <span className="md:hidden">
                  <TrendingUp className="h-5 w-5" />
                </span>
                {APP_NAME_AR}
              </div>

              <MobileSidebarButton />
            </header>

            <main className="app-main relative flex-1 overflow-auto p-3 pb-20 sm:p-4 md:p-6 md:pb-8 lg:p-8">
              <div className="pointer-events-none absolute top-0 left-1/4 -z-10 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>

      <nav className="app-bottom-nav safe-area-inset-bottom fixed right-0 bottom-0 left-0 z-50 border-t border-white/10 bg-card/95 backdrop-blur-xl md:hidden">
        <div className="flex h-16 items-center justify-around px-2">
          {mobileNavItems.map((item) => {
            const isActive = location === item.url;
            return (
              <Link
                key={item.url}
                href={item.url}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-3 py-1.5 transition-all ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                <span className={`truncate text-[10px] font-medium ${isActive ? "text-primary" : ""}`}>
                  {item.title}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function MobileSidebarButton() {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="flex items-center justify-center rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground md:hidden"
      aria-label="فتح القائمة"
    >
      <Menu className="h-6 w-6" />
    </button>
  );
}
