import { useTheme } from "@/components/ThemeProvider";
import { Moon, Sun } from "lucide-react";

/** Compact light/dark switch for headers. Full light/dark/system choice lives in Settings. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setTheme } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={
        "inline-flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground " +
        (className ?? "")
      }
    >
      {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
