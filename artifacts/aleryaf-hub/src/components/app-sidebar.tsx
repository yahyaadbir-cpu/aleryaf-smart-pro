import { Link, useLocation } from "wouter";
import {
  Activity,
  BarChart3,
  Box,
  BookOpenText,
  Building2,
  Database,
  FileText,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Package,
  Terminal,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_NAME_AR, APP_TAGLINE_AR } from "@/lib/branding";
import { useAuth } from "@/context/auth";

const invoiceSystemItems = [
  { title: "الفواتير", url: "/invoices", icon: FileText },
  { title: "المنتجات", url: "/items", icon: Package },
  { title: "إدارة الفروع", url: "/branches", icon: Building2 },
];

const analyticsHubItems = [
  { title: "لوحة التحكم", url: "/", icon: LayoutDashboard },
  { title: "تحليل الفروع", url: "/branch-analytics", icon: BarChart3 },
  { title: "تحليل الأرباح", url: "/profit", icon: TrendingUp },
  { title: "تقارير الشركة", url: "/reports", icon: FileSpreadsheet },
  { title: "المخزون", url: "/inventory", icon: Box },
];

const adminItems = [
  { title: "مركز الأوامر", url: "/admin-control", icon: Terminal },
  { title: "إدارة المستخدمين", url: "/admin-users", icon: Users },
  { title: "سجل النشاط", url: "/admin-log", icon: Activity },
];

const handbookAdminItem = { title: "دليل التشغيل", url: "/admin-handbook", icon: BookOpenText };

function NavSection({
  label,
  items,
  location,
  icon: SectionIcon,
}: {
  label: string;
  items: Array<{ title: string; url: string; icon: LucideIcon }>;
  location: string;
  icon: LucideIcon;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="mt-4 mb-1 flex items-center gap-2 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
        <SectionIcon className="h-3.5 w-3.5" />
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = location === item.url;
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                  <Link
                    href={item.url}
                    className={`mx-2 flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200 ${
                      isActive
                        ? "border-r-2 border-primary bg-primary/15 text-primary shadow-sm shadow-primary/10"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    }`}
                  >
                    <item.icon className={`h-[18px] w-[18px] ${isActive ? "text-primary" : ""}`} />
                    <span className="text-[14px] font-medium">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <Sidebar side="right" variant="sidebar" className="border-l border-white/5">
      <SidebarHeader className="border-b border-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="font-display text-base leading-tight font-bold text-foreground">{APP_NAME_AR}</h2>
            <p className="text-[10px] font-medium text-muted-foreground/60">{APP_TAGLINE_AR}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <NavSection label="مركز التحليل" items={analyticsHubItems} location={location} icon={BarChart3} />
        <div className="mx-4 my-1 border-t border-white/5" />
        <NavSection label="مصدر البيانات" items={invoiceSystemItems} location={location} icon={Database} />

        {user?.isAdmin && (
          <>
            <div className="mx-4 my-1 border-t border-white/5" />
            <NavSection label="الإدارة" items={[...adminItems, handbookAdminItem]} location={location} icon={Activity} />
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-white/5 p-3">
        <div className="flex items-center justify-between gap-2 px-2">
          <span className="truncate text-xs text-muted-foreground">
            {user?.username}
            {user?.isAdmin && <span className="mr-1 text-primary">(مدير)</span>}
          </span>
          <button
            onClick={() => {
              void logout();
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-rose-400"
            title="تسجيل الخروج"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
