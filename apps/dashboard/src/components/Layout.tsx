import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Brain,
  HeartPulse,
  MessageSquare,
  Puzzle,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "./ThemeToggle";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/heartbeat", label: "Heartbeat", icon: HeartPulse },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/skills", label: "Skills", icon: Puzzle },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-card flex flex-col">
        <div className="p-4">
          <h1 className="text-lg font-semibold tracking-tight">Third Brain</h1>
          <p className="text-xs text-muted-foreground">Dashboard</p>
        </div>
        <Separator />
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <a
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </a>
              </Link>
            );
          })}
        </nav>
        <Separator />
        <div className="p-2">
          <ThemeToggle />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
