"use client"

import { forwardRef, useImperativeHandle, useState } from "react"

export interface CrisisButtonHandle {
  open(): void
}

const CrisisButton = forwardRef<CrisisButtonHandle>(
  function CrisisButton(_, ref) {
    const [open, setOpen] = useState(false)

    useImperativeHandle(ref, () => ({ open: () => setOpen(true) }))

    function close() {
      setOpen(false)
    }

    return (
      <>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open crisis resources"
          className="fixed right-4 bottom-24 z-40 flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-destructive bg-background shadow-lg transition-colors hover:bg-destructive/10"
        >
          <span className="text-lg leading-none font-bold text-destructive">
            SOS
          </span>
          <span className="mt-0.5 text-[9px] font-medium tracking-wide text-destructive/80">
            HELP
          </span>
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
              aria-labelledby="crisis-modal-title"
              className="mx-4 max-w-md rounded-2xl bg-background p-6 shadow-xl"
            >
              <h2
                id="crisis-modal-title"
                className="mb-3 text-lg font-semibold text-foreground"
              >
                You&apos;re not alone
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                If you&apos;re in crisis or thinking about harming yourself,
                please reach out right away. This companion is not a crisis
                service.
              </p>
              <ul className="mb-6 space-y-2 text-sm">
                <li>
                  <strong>988 Suicide &amp; Crisis Lifeline</strong> — call or
                  text{" "}
                  <a
                    href="tel:988"
                    className="font-medium text-destructive underline"
                  >
                    988
                  </a>{" "}
                  (24/7, free, confidential)
                </li>
                <li>
                  <strong>Crisis Text Line</strong> — text <strong>HOME</strong>{" "}
                  to{" "}
                  <a
                    href="sms:741741"
                    className="font-medium text-destructive underline"
                  >
                    741741
                  </a>
                </li>
                <li>
                  <strong>Emergency services</strong> — call{" "}
                  <a
                    href="tel:911"
                    className="font-medium text-destructive underline"
                  >
                    911
                  </a>{" "}
                  if you&apos;re in immediate danger
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
)

export { CrisisButton }
