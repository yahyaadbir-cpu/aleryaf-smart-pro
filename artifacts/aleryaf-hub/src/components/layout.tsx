import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { APP_NAME_AR } from "@/lib/branding";
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Box,
  FileText,
  BarChart3,
  UserCircle,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/auth";

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
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

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

              <div className="relative md:hidden" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center justify-center rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
                  aria-label="حساب المستخدم"
                >
                  <UserCircle className="h-6 w-6" />
                </button>

                {menuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-48 rounded-xl border border-white/10 bg-card/95 p-1 shadow-xl backdrop-blur-xl" dir="rtl">
                    <div className="px-3 py-2 border-b border-white/8 mb-1">
                      <p className="text-xs text-muted-foreground">مسجل الدخول كـ</p>
                      <p className="text-sm font-bold text-foreground truncate">
                        {user?.username}
                        {user?.isAdmin && <span className="mr-1 text-xs text-primary">(مدير)</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => { logout(); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-400 transition-colors hover:bg-rose-500/10"
                    >
                      <LogOut className="h-4 w-4" />
                      تسجيل الخروج
                    </button>
                  </div>
                )}
              </div>
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
                <span className={`truncate text-[10px] font-medium ${isActive ? "text-primary" : ""}`}>{item.title}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
