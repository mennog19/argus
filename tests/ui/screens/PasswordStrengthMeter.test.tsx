import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PasswordStrengthMeter } from "../../../src/ui/screens/PasswordStrengthMeter";

describe("PasswordStrengthMeter", () => {
  it("renders nothing for an empty password", () => {
    const { container } = render(<PasswordStrengthMeter password="" />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["short", "Weak", "weak"],
    ["Abcdefghij12", "Fair", "fair"],
    ["Abcdefghijklmn1!", "Strong", "strong"],
  ])("labels %s as %s", (password, label, tier) => {
    render(<PasswordStrengthMeter password={password} />);

    expect(screen.getByText(label)).toHaveClass("password-strength", tier);
  });
});
