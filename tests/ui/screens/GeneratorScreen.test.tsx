import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordPolicyOptions } from "../../../src/domain";
import { GeneratorScreen } from "../../../src/ui/screens/GeneratorScreen";

function renderGenerator(policyOptions: PasswordPolicyOptions = {}) {
  const onPolicyChange = vi.fn();
  const writeText = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <GeneratorScreen
      policyOptions={policyOptions}
      onPolicyChange={onPolicyChange}
      clipboardWriter={{ writeText, clearIfUnchanged: vi.fn() }}
    />,
  );
  return { onPolicyChange, writeText, unmount: view.unmount };
}

describe("GeneratorScreen", () => {
  it("generates a password of the default length on mount", () => {
    renderGenerator();

    expect(document.querySelector(".generator-password")?.textContent).toHaveLength(16);
    expect(screen.getByLabelText(/^Length/)).toHaveValue("16");
    expect(screen.getByRole("checkbox", { name: /uppercase/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /symbols/i })).not.toBeChecked();
  });

  it("regenerates a new password of the same length when Regenerate is clicked", async () => {
    const user = userEvent.setup();
    renderGenerator({ length: 24 });

    await user.click(screen.getByRole("button", { name: "Regenerate password" }));

    expect(document.querySelector(".generator-password")?.textContent).toHaveLength(24);
  });

  it("copies the shown password without scheduling a clipboard wipe", async () => {
    vi.useFakeTimers();
    try {
      const { writeText } = renderGenerator();
      const password = document.querySelector(".generator-password")?.textContent;

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy password" }));
      });

      expect(writeText).toHaveBeenCalledExactlyOnceWith(password);
      expect(screen.getByText("Copied")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the Copied label timer when unmounted", async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderGenerator();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy password" }));
      });

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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
});
