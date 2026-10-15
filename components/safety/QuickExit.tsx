"use client"

const QUICK_EXIT_URL = "https://www.weather.com"

export function QuickExit() {
  return (
    <button
      aria-label="Leave this site immediately"
      onClick={() => window.location.replace(QUICK_EXIT_URL)}
      className="fixed bottom-4 left-4 z-40 rounded-full bg-muted px-4 py-2 text-sm font-medium text-muted-foreground shadow-lg"
    >
      Quick Exit
    </button>
  )
}
