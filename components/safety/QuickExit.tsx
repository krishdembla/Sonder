"use client"

const QUICK_EXIT_URL = "https://www.weather.com"

export function QuickExit() {
  return (
    <button
      aria-label="Leave this site immediately"
      onClick={() => window.location.replace(QUICK_EXIT_URL)}
      className="fixed bottom-4 left-4 z-40 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted"
    >
      Quick Exit
    </button>
  )
}
