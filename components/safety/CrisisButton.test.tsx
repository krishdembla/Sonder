// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { createRef } from "react"
import { CrisisButton, type CrisisButtonHandle } from "./CrisisButton"

describe("CrisisButton", () => {
  it("renders nothing (no dialog) when closed", () => {
    render(<CrisisButton />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens modal via imperative ref handle", () => {
    const ref = createRef<CrisisButtonHandle>()
    render(<CrisisButton ref={ref} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    act(() => {
      ref.current!.open()
    })
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(/you're not alone/i)).toBeInTheDocument()
  })

  it("lists 988, 741741, and 911 in the modal", () => {
    const ref = createRef<CrisisButtonHandle>()
    render(<CrisisButton ref={ref} />)
    act(() => {
      ref.current!.open()
    })
    expect(screen.getByRole("link", { name: "988" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "741741" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "911" })).toBeInTheDocument()
  })

  it("closes modal when Close button is clicked", () => {
    const ref = createRef<CrisisButtonHandle>()
    render(<CrisisButton ref={ref} />)
    act(() => {
      ref.current!.open()
    })
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
