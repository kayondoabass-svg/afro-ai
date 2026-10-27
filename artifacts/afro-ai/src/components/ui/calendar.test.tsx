import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Calendar } from "./calendar";

describe("installed DayPicker v8 calendar adapter", () => {
  it("renders, navigates and selects dates without v9-only components", () => {
    const onSelect = vi.fn();
    render(<Calendar mode="single" showOutsideDays={false} defaultMonth={new Date(2026, 9, 1)} onSelect={onSelect} />);
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    fireEvent.click(screen.getByRole("gridcell", { name: /^27$/ }));
    expect(onSelect.mock.calls[0][0]).toEqual(new Date(2026, 9, 27));
  });

  it("supports ranges, disabled dates and caller class overrides", () => {
    const onSelect = vi.fn();
    const { container } = render(<Calendar mode="range" showOutsideDays={false} defaultMonth={new Date(2026, 9, 1)}
      selected={{ from: new Date(2026, 9, 12), to: new Date(2026, 9, 14) }}
      disabled={new Date(2026, 9, 27)} onSelect={onSelect} classNames={{ day: "custom-day" }} />);
    expect(container.querySelectorAll('[aria-selected="true"]').length).toBe(3);
    const disabled = screen.getByRole("gridcell", { name: /^27$/ });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("gridcell", { name: /^13$/ })).toHaveClass("custom-day");
  });
});
