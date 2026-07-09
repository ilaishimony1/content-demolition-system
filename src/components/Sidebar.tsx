"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { User } from "firebase/auth";
import { useState } from "react";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "⚡", href: "/" },
  { id: "clients", label: "Clients", icon: "👥", href: "/clients" },
  { id: "library", label: "B-Roll Library", icon: "🎬", href: "/library" },
  { id: "inspiration", label: "Inspiration Feed", icon: "🔥", href: "/inspiration" },
  { id: "podcast", label: "Podcast Engine", icon: "🎙️", href: "/podcast" },
  { id: "production", label: "Production Queue", icon: "🎯", href: "/production" },
  { id: "schedule", label: "Schedule", icon: "📅", href: "/schedule" },
  { id: "analytics", label: "Analytics", icon: "📊", href: "/analytics" },
];

function NavContent({ user, pathname, setMobileOpen }: { user: User; pathname: string; setMobileOpen: (v: boolean) => void }) {
  return (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <Link href="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
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
              onClick={() => setMobileOpen(false)}
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
    </>
  );
}

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 bg-[#111118] border-r border-white/10 flex-col shrink-0">
        <NavContent user={user} pathname={pathname} setMobileOpen={setMobileOpen} />
      </div>

      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#111118] border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-xs">
            💥
          </div>
          <div className="font-bold text-sm text-white">Content <span className="text-orange-400">Demolition</span></div>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-white/60 hover:text-white p-1"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-72 bg-[#111118] border-r border-white/10 flex flex-col pt-14">
            <NavContent user={user} pathname={pathname} setMobileOpen={setMobileOpen} />
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}
