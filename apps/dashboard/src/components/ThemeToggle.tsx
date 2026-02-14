import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import type { Theme } from "./ThemeProvider";

const cycle: Record<string, Theme> = {
  auto: "light",
  light: "dark",
  dark: "auto",
};

const meta: Record<string, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: "Light" },
  dark: { icon: Moon, label: "Dark" },
  auto: { icon: Monitor, label: "Auto" },
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { icon: Icon, label } = meta[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(cycle[theme])}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors w-full"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
