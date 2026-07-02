"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UploadCloud, History, BarChart2, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/upload", label: "Upload", icon: UploadCloud },
  { href: "/history", label: "History", icon: History },
  { href: "/performance", label: "Past Performance", icon: BarChart2 },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      className="flex h-screen w-[240px] shrink-0 flex-col bg-sidebar-bg text-sidebar-text border-r border-border/10"
      style={{ position: "sticky", top: 0 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-white/5">
        <span className="font-sans text-xl font-bold tracking-tight text-white">
          provify
        </span>
        <span className="rounded-full bg-blue/20 px-2 py-0.5 text-[10px] font-semibold text-blue font-mono-tag">
          beta
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1.5 px-3 py-6">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-white/10 text-white rounded-r-lg border-l-[3px] border-blue pl-[13px]"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-white rounded-lg pl-4"
              }`}
            >
              <Icon
                className={`size-4 shrink-0 transition-colors ${
                  active ? "text-blue" : "text-sidebar-muted group-hover:text-white"
                }`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-white/5">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-sidebar-muted transition-all duration-200 hover:bg-white/5 hover:text-red pl-4"
        >
          <LogOut className="size-4 shrink-0" />
          Logout
        </button>
      </div>
    </aside>
  );
}
