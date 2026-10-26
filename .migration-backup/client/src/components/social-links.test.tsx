import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SocialLinks } from "./social-links";

afterEach(cleanup);

it("links both labeled social icons to the official profiles in safe new tabs", () => {
  render(<SocialLinks />);
  for (const [name, href] of [
    ["Facebook", "https://www.facebook.com/afroaigroup"],
    ["Instagram", "https://www.instagram.com/afroaigroup/"],
  ]) {
    const link = screen.getByRole("link", { name: `Afro AI on ${name} (opens in a new tab)` });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  }
});