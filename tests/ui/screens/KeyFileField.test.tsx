import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyFileField } from "../../../src/ui/screens/KeyFileField";

describe("KeyFileField", () => {
  it("offers to choose a key file when none is set, and reports the pick", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onPick = vi.fn().mockResolvedValue("C:/keys/mine.keyx");

    render(<KeyFileField keyFilePath={undefined} onPick={onPick} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Use a key file…" }));

    expect(onPick).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith("C:/keys/mine.keyx");
  });

  it("leaves the selection alone when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <KeyFileField
        keyFilePath={undefined}
        onPick={vi.fn().mockResolvedValue(undefined)}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Use a key file…" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the chosen key file's name, with its full path on hover", () => {
    render(
      <KeyFileField keyFilePath={"C:\\keys\\mine.keyx"} onPick={vi.fn()} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Key file: mine.keyx")).toHaveAttribute("title", "C:\\keys\\mine.keyx");
  });

  it("clears the key file on Remove", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<KeyFileField keyFilePath="C:/keys/mine.keyx" onPick={vi.fn()} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Remove key file" }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("disables both controls while busy", () => {
    const { rerender } = render(
      <KeyFileField keyFilePath={undefined} onPick={vi.fn()} onChange={vi.fn()} disabled />,
    );
    expect(screen.getByRole("button", { name: "Use a key file…" })).toBeDisabled();

    rerender(
      <KeyFileField keyFilePath="C:/keys/mine.keyx" onPick={vi.fn()} onChange={vi.fn()} disabled />,
    );
    expect(screen.getByRole("button", { name: "Remove key file" })).toBeDisabled();
  });
});
