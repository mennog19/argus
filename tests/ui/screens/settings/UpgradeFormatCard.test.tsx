import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpgradeFormatCard } from "../../../../src/ui/screens/settings/UpgradeFormatCard";

const KDBX3 = { major: 3, minor: 1 };

function upgradeButton() {
  return screen.getByRole("button", { name: "Upgrade to KDBX 4" });
}

describe("UpgradeFormatCard", () => {
  it("renders nothing while the format isn't known yet", () => {
    const { container } = render(
      <UpgradeFormatCard format={undefined} onUpgradeFormat={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a vault that is already KDBX 4", () => {
    const { container } = render(
      <UpgradeFormatCard format={{ major: 4, minor: 0 }} onUpgradeFormat={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("names a KDBX 3 vault's format and asks for confirmation before upgrading", async () => {
    const user = userEvent.setup();
    const onUpgradeFormat = vi.fn();
    render(<UpgradeFormatCard format={KDBX3} onUpgradeFormat={onUpgradeFormat} />);

    expect(screen.getByText(/this vault is kdbx 3\.1/i)).toBeInTheDocument();
    await user.click(upgradeButton());

    expect(onUpgradeFormat).not.toHaveBeenCalled();
    expect(screen.getByText(/won't be able to open the vault/i)).toBeInTheDocument();
  });

  it("goes back to the plain button when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const onUpgradeFormat = vi.fn();
    render(<UpgradeFormatCard format={KDBX3} onUpgradeFormat={onUpgradeFormat} />);

    await user.click(upgradeButton());
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onUpgradeFormat).not.toHaveBeenCalled();
    expect(screen.queryByText(/won't be able to open the vault/i)).not.toBeInTheDocument();
    expect(upgradeButton()).toBeInTheDocument();
  });

  it("confirms the upgrade once it succeeds, even after the format prop turns KDBX 4", async () => {
    const user = userEvent.setup();
    const onUpgradeFormat = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <UpgradeFormatCard format={KDBX3} onUpgradeFormat={onUpgradeFormat} />,
    );

    await user.click(upgradeButton());
    await user.click(upgradeButton());
    rerender(
      <UpgradeFormatCard format={{ major: 4, minor: 0 }} onUpgradeFormat={onUpgradeFormat} />,
    );

    expect(onUpgradeFormat).toHaveBeenCalledOnce();
    expect(screen.getByText("Upgraded to KDBX 4.")).toBeInTheDocument();
    expect(screen.getByText(/\.kdbx3-backup\.kdbx/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows why the upgrade failed and lets it be retried", async () => {
    const user = userEvent.setup();
    const onUpgradeFormat = vi.fn().mockRejectedValue(new Error("Disk full."));
    render(<UpgradeFormatCard format={KDBX3} onUpgradeFormat={onUpgradeFormat} />);

    await user.click(upgradeButton());
    await user.click(upgradeButton());

    expect(screen.getByText("Disk full.")).toBeInTheDocument();
    expect(screen.queryByText("Upgraded to KDBX 4.")).not.toBeInTheDocument();
    expect(upgradeButton()).toBeEnabled();
  });

  it("disables both buttons while the upgrade runs", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onUpgradeFormat = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<UpgradeFormatCard format={KDBX3} onUpgradeFormat={onUpgradeFormat} />);

    await user.click(upgradeButton());
    await user.click(upgradeButton());

    expect(screen.getByRole("button", { name: "Upgrading…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    finish();
    expect(await screen.findByText("Upgraded to KDBX 4.")).toBeInTheDocument();
  });
});
