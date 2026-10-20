// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QuickExit } from "./QuickExit"

describe("QuickExit", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the quick exit button", () => {
    render(<QuickExit />)
    expect(
      screen.getByRole("button", { name: /leave this site/i })
    ).toBeInTheDocument()
  })

  it("replaces location with weather.com on click", () => {
    const replaceMock = vi.fn()
    vi.stubGlobal("location", { replace: replaceMock })
    render(<QuickExit />)
    fireEvent.click(screen.getByRole("button", { name: /leave this site/i }))
    expect(replaceMock).toHaveBeenCalledWith("https://www.weather.com")
  })
})
