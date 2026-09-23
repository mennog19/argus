import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordPolicyOptions } from "../../domain";
import { GeneratorScreen } from "./GeneratorScreen";

function renderGenerator(policyOptions: PasswordPolicyOptions = {}) {
  const onPolicyChange = vi.fn();
  render(<GeneratorScreen policyOptions={policyOptions} onPolicyChange={onPolicyChange} />);
  return { onPolicyChange };
}

describe("GeneratorScreen", () => {
  it("generates a password of the default length in character mode on mount", () => {
    renderGenerator();

    expect(document.querySelector(".generator-password")?.textContent).toHaveLength(16);
    expect(screen.getByLabelText(/^Length/)).toHaveValue("16");
    expect(screen.getByRole("checkbox", { name: /uppercase/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /symbols/i })).not.toBeChecked();
    expect(screen.queryByLabelText(/^Word count/)).not.toBeInTheDocument();
  });

  it("shows word count and separator controls instead when the policy's mode is 'passphrase'", () => {
    renderGenerator({ mode: "passphrase" });

    expect(screen.getByLabelText(/^Word count/)).toBeInTheDocument();
    expect(screen.getByLabelText("Separator")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Length/)).not.toBeInTheDocument();
    expect(document.querySelector(".generator-password")?.textContent?.split("-")).toHaveLength(4);
  });

  it("regenerates a new password of the same length when Regenerate is clicked", async () => {
    const user = userEvent.setup();
    renderGenerator({ length: 24 });

    await user.click(screen.getByRole("button", { name: "Regenerate password" }));

    expect(document.querySelector(".generator-password")?.textContent).toHaveLength(24);
  });

  it("updates the length and reports the new policy when the length slider changes", () => {
    const { onPolicyChange } = renderGenerator({ length: 16 });

    fireEvent.change(screen.getByLabelText(/^Length/), { target: { value: "32" } });

    expect(onPolicyChange).toHaveBeenCalledWith(expect.objectContaining({ length: 32 }));
    expect(document.querySelector(".generator-password")?.textContent).toHaveLength(32);
  });

  it("toggles a character set off and reflects it in the generated password", async () => {
    const user = userEvent.setup();
    const { onPolicyChange } = renderGenerator({
      length: 30,
      useUppercase: true,
      useLowercase: true,
      useDigits: false,
      useSymbols: false,
    });

    await user.click(screen.getByRole("checkbox", { name: /uppercase/i }));

    expect(onPolicyChange).toHaveBeenCalledWith(expect.objectContaining({ useUppercase: false }));
    expect(document.querySelector(".generator-password")?.textContent).not.toMatch(/[A-Z]/);
  });

  it("toggles the remaining character sets", async () => {
    const user = userEvent.setup();
    const { onPolicyChange } = renderGenerator({
      useUppercase: true,
      useLowercase: true,
      useDigits: true,
      useSymbols: false,
    });

    await user.click(screen.getByRole("checkbox", { name: /lowercase/i }));
    expect(onPolicyChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ useLowercase: false }),
    );

    await user.click(screen.getByRole("checkbox", { name: /digits/i }));
    expect(onPolicyChange).toHaveBeenLastCalledWith(expect.objectContaining({ useDigits: false }));

    await user.click(screen.getByRole("checkbox", { name: /symbols/i }));
    expect(onPolicyChange).toHaveBeenLastCalledWith(expect.objectContaining({ useSymbols: true }));
  });

  it("ignores unchecking the last enabled character set instead of throwing", async () => {
    const user = userEvent.setup();
    const { onPolicyChange } = renderGenerator({
      useUppercase: true,
      useLowercase: false,
      useDigits: false,
      useSymbols: false,
    });

    await user.click(screen.getByRole("checkbox", { name: /uppercase/i }));

    expect(onPolicyChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /uppercase/i })).toBeChecked();
  });

  it("toggles exclude-ambiguous characters", async () => {
    const user = userEvent.setup();
    const { onPolicyChange } = renderGenerator();

    await user.click(screen.getByRole("checkbox", { name: /exclude ambiguous/i }));

    expect(onPolicyChange).toHaveBeenCalledWith(
      expect.objectContaining({ excludeAmbiguous: true }),
    );
  });

  it("reports switching to passphrase mode via the mode toggle", async () => {
    const user = userEvent.setup();
    const { onPolicyChange } = renderGenerator();

    await user.click(screen.getByRole("button", { name: "Passphrase" }));

    expect(onPolicyChange).toHaveBeenCalledWith(expect.objectContaining({ mode: "passphrase" }));
  });

  it("reports switching back to character mode via the mode toggle", async () => {
    const user = userEvent.setup();
    const { onPolicyChange } = renderGenerator({ mode: "passphrase" });

    await user.click(screen.getByRole("button", { name: "Characters" }));

    expect(onPolicyChange).toHaveBeenCalledWith(expect.objectContaining({ mode: "characters" }));
  });

  it("changes the passphrase word count and separator", () => {
    const { onPolicyChange } = renderGenerator({
      mode: "passphrase",
      wordCount: 4,
      separator: "-",
    });

    fireEvent.change(screen.getByLabelText("Separator"), { target: { value: "." } });

    expect(onPolicyChange).toHaveBeenCalledWith(expect.objectContaining({ separator: "." }));
    expect(document.querySelector(".generator-password")?.textContent?.split(".")).toHaveLength(4);

    fireEvent.change(screen.getByLabelText(/^Word count/), { target: { value: "6" } });

    expect(onPolicyChange).toHaveBeenCalledWith(expect.objectContaining({ wordCount: 6 }));
  });
});
