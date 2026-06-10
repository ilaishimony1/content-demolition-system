"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { User } from "firebase/auth";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "⚡", href: "/" },
  { id: "clients", label: "Clients", icon: "👥", href: "/clients" },
  { id: "library", label: "B-Roll Library", icon: "🎬", href: "/library" },
  { id: "inspiration", label: "Inspiration Feed", icon: "🔥", href: "/inspiration" },
  { id: "production", label: "Production Queue", icon: "🎯", href: "/production" },
  { id: "schedule", label: "Schedule", icon: "📅", href: "/schedule" },
  { id: "analytics", label: "Analytics", icon: "📊", href: "/analytics" },
];

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-[#111118] border-r border-white/10 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-sm">
            💥
          </div>
          <div>
            <div className="font-bold text-sm leading-tight text-white">Content</div>
            <div className="font-bold text-sm leading-tight text-orange-400">Demolition</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-orange-500/20 text-orange-400 font-medium"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-xs font-bold text-white">
            {user.email?.[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{user.email}</div>
            <div className="text-xs text-white/40">Operator</div>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
            title="Sign out"
          >
            ↩
          </button>
        </div>
      </div>
    </div>
  );
}
