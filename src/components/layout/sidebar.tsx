"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TableProperties,
  Bell,
  Settings,
  Users,
  List,
  DollarSign,
  CalendarClock,
} from "lucide-react";
import type { UserRole } from "@/lib/auth";
import { useAgentSession } from "@/stores/agent-session";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
  },
  {
    href: "/sales",
    label: "Sales",
    icon: <TableProperties size={18} />,
  },
  {
    href: "/follow-ups",
    label: "Follow-ups Due",
    icon: <CalendarClock size={18} />,
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: <Bell size={18} />,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: <Settings size={18} />,
  },
  {
    href: "/admin/agents",
    label: "Agent Management",
    icon: <Users size={18} />,
    adminOnly: true,
  },
  {
    href: "/admin/leads",
    label: "All Leads",
    icon: <List size={18} />,
    adminOnly: true,
  },
  {
    href: "/admin/payouts",
    label: "Payouts",
    icon: <DollarSign size={18} />,
    adminOnly: true,
  },
];

interface SidebarProps {
  role: UserRole;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const { unreadNotifications } = useAgentSession();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || role === "admin",
  );

  return (
    <aside className="w-60 flex flex-col bg-orayn-dark h-full border-r border-white/5">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-white/5 flex-shrink-0">
        <span className="font-sora text-xl font-bold text-orayn-gold tracking-wide">
          ORAYN
        </span>
        <span className="ml-2 text-xs text-white/40 font-inter font-medium">
          market.zone
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {role === "admin" && (
          <>
            <p className="px-6 text-xs font-bold uppercase tracking-widest text-white/30 mb-2">
              Agent View
            </p>
            {NAV_ITEMS.filter((i) => !i.adminOnly).map((item) => (
              <SidebarItem
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                unreadCount={
                  item.href === "/notifications" ? unreadNotifications : 0
                }
              />
            ))}
            <div className="my-3 mx-6 border-t border-white/10" />
            <p className="px-6 text-xs font-bold uppercase tracking-widest text-white/30 mb-2">
              Admin
            </p>
            {NAV_ITEMS.filter((i) => i.adminOnly).map((item) => (
              <SidebarItem
                key={item.href}
                item={item}
                isActive={pathname.startsWith(item.href)}
                unreadCount={0}
              />
            ))}
          </>
        )}

        {role === "agent" && (
          <>
            {visibleItems.map((item) => (
              <SidebarItem
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                unreadCount={
                  item.href === "/notifications" ? unreadNotifications : 0
                }
              />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="h-12 flex items-center px-6 border-t border-white/5 flex-shrink-0">
        <p className="text-xs text-white/20 font-inter">
          &copy; 2026 Orayn. Confidential.
        </p>
      </div>
    </aside>
  );
}

function SidebarItem({
  item,
  isActive,
  unreadCount,
}: {
  item: NavItem;
  isActive: boolean;
  unreadCount: number;
}) {
  return (
    <Link
      href={item.href}
      className={`
        flex items-center gap-3 px-6 py-2.5 mx-2 rounded-lg text-sm font-inter font-medium
        transition-all duration-150 relative group
        ${
          isActive
            ? "bg-white/10 text-white border-l-2 border-orayn-gold -ml-px pl-[23px]"
            : "text-white/60 hover:text-white hover:bg-white/5"
        }
      `}
    >
      <span
        className={
          isActive
            ? "text-orayn-gold"
            : "text-white/50 group-hover:text-white/80"
        }
      >
        {item.icon}
      </span>
      <span>{item.label}</span>
      {unreadCount > 0 && (
        <span className="ml-auto bg-orayn-gold text-orayn-dark text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
