// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { AboutButton } from "./AboutButton"

describe("AboutButton", () => {
  it("renders the About trigger", () => {
    render(<AboutButton />)
    expect(
      screen.getByRole("button", { name: /about this companion/i })
    ).toBeInTheDocument()
  })

  it("modal is not visible initially", () => {
    render(<AboutButton />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens modal when trigger is clicked", () => {
    render(<AboutButton />)
    fireEvent.click(
      screen.getByRole("button", { name: /about this companion/i })
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(/about this companion/i)).toBeInTheDocument()
  })

  it("modal contains disclaimer items", () => {
    render(<AboutButton />)
    fireEvent.click(
      screen.getByRole("button", { name: /about this companion/i })
    )
    expect(
      screen.getByText(/not a substitute for professional care/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/not a crisis or emergency service/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/no medical advice or diagnosis/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/research prototype/i)).toBeInTheDocument()
  })

  it("closes modal when Close button is clicked", () => {
    render(<AboutButton />)
    fireEvent.click(
      screen.getByRole("button", { name: /about this companion/i })
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
