"use client"

import { useState } from "react"

export function AboutButton() {
  const [open, setOpen] = useState(false)

  function close() {
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="About this companion and disclaimer"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        About
      </button>

      {open && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-modal-title"
            className="mx-4 max-w-md rounded-2xl bg-background p-6 shadow-xl"
          >
            <h2
              id="about-modal-title"
              className="mb-4 text-lg font-semibold text-foreground"
            >
              About this companion
            </h2>
            <ul className="mb-6 space-y-3 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">
                  Not a substitute for professional care
                </strong>{" "}
                — this is a supportive companion, not a therapist, doctor, or
                counselor, and cannot replace professional mental health care.
              </li>
              <li>
                <strong className="text-foreground">
                  Not a crisis or emergency service
                </strong>{" "}
                — if you are in crisis or thinking about harming yourself, use
                the Crisis Resources button or call/text{" "}
                <a href="tel:988" className="text-destructive underline">
                  988
                </a>{" "}
                (or{" "}
                <a href="tel:911" className="text-destructive underline">
                  911
                </a>{" "}
                if you are in immediate danger).
              </li>
              <li>
                <strong className="text-foreground">
                  No medical advice or diagnosis
                </strong>{" "}
                — it cannot diagnose, prescribe, or give medical or clinical
                advice.
              </li>
              <li>
                <strong className="text-foreground">Research prototype</strong>{" "}
                — an early DSAIL (Indiana University) prototype on a baseline AI
                model; responses may be inaccurate. Please do not enter real
                personal or clinical details — conversations here are test data
                only.
              </li>
            </ul>
            <button
              onClick={close}
              className="w-full rounded-xl border px-4 py-2 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
