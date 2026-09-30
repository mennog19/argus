import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AvailableUpdate, UpdateDownloadProgress } from "../../../src/application/updater";
import { UpdateDialog } from "../../../src/ui/screens/UpdateDialog";

const UPDATE: AvailableUpdate = { version: "0.2.0", currentVersion: "0.1.0" };

type ProgressHandler = (progress: UpdateDownloadProgress) => void;

/** An install that stays pending, handing back its progress callback and a way to fail it. */
function pendingInstall() {
  let report: ProgressHandler | undefined;
  let fail: ((cause: unknown) => void) | undefined;
  const onInstall = vi.fn(
    (onProgress: ProgressHandler) =>
      new Promise<void>((_, reject) => {
        report = onProgress;
        fail = reject;
      }),
  );
  return {
    onInstall,
    report: (progress: UpdateDownloadProgress) => act(() => report!(progress)),
    fail: (cause: unknown) => act(async () => fail!(cause)),
  };
}

function renderDialog(
  update: AvailableUpdate = UPDATE,
  onInstall: (onProgress: ProgressHandler) => Promise<void> = vi.fn(
    () => new Promise<void>(() => {}),
  ),
) {
  const onDismiss = vi.fn();
  render(<UpdateDialog update={update} onInstall={onInstall} onDismiss={onDismiss} />);
  return { onDismiss };
}

const installButton = () => screen.getByRole("button", { name: /install and restart/i });

describe("UpdateDialog", () => {
  it("names the new version and the one running", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Update available" })).toBeInTheDocument();
    expect(screen.getByText("Argus 0.2.0 is available. You have 0.1.0.")).toBeInTheDocument();
  });

  it("warns that installing restarts Argus and locks the vault", () => {
    renderDialog();

    expect(screen.getByText(/closes Argus/)).toHaveTextContent(/vault will be locked/);
  });

  it("shows the release notes as plain text", () => {
    renderDialog({ ...UPDATE, notes: "<b>Faster</b> unlock" });

    expect(screen.getByText("<b>Faster</b> unlock")).toBeInTheDocument();
  });

  it("shows no notes box when the release has none", () => {
    const { container } = render(
      <UpdateDialog update={UPDATE} onInstall={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(container.querySelector(".update-notes")).toBeNull();
  });

  it("dismisses on Not now", () => {
    const { onDismiss } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("installs, disabling both buttons while it runs", () => {
    const install = pendingInstall();
    renderDialog(UPDATE, install.onInstall);

    fireEvent.click(installButton());

    expect(install.onInstall).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Downloading…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
  });

  it("shows the download as a percentage when its size is known", () => {
    const install = pendingInstall();
    renderDialog(UPDATE, install.onInstall);
    fireEvent.click(installButton());

    install.report({ downloadedBytes: 450, totalBytes: 1000 });

    expect(screen.getByRole("button", { name: "Downloading… 45%" })).toBeInTheDocument();
  });

  it("shows how much has downloaded when its size is unknown", () => {
    const install = pendingInstall();
    renderDialog(UPDATE, install.onInstall);
    fireEvent.click(installButton());

    install.report({ downloadedBytes: 3 * 1024 * 1024 });

    expect(screen.getByRole("button", { name: "Downloading… 3.0 MB" })).toBeInTheDocument();
  });

  it("treats a zero size as unknown", () => {
    const install = pendingInstall();
    renderDialog(UPDATE, install.onInstall);
    fireEvent.click(installButton());

    install.report({ downloadedBytes: 100, totalBytes: 0 });

    expect(screen.getByRole("button", { name: "Downloading… 100 B" })).toBeInTheDocument();
  });

  it("says it's installing once the download is complete", () => {
    const install = pendingInstall();
    renderDialog(UPDATE, install.onInstall);
    fireEvent.click(installButton());

    install.report({ downloadedBytes: 1000, totalBytes: 1000 });

    expect(screen.getByRole("button", { name: "Installing…" })).toBeInTheDocument();
  });

  it("reports a failed install and lets the user retry or dismiss", async () => {
    const install = pendingInstall();
    renderDialog(UPDATE, install.onInstall);
    fireEvent.click(installButton());

    await install.fail("signature mismatch");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The update couldn’t be installed: signature mismatch",
    );
    expect(installButton()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeEnabled();
  });

  it("falls back to a generic message when the failure says nothing", async () => {
    const install = pendingInstall();
    renderDialog(UPDATE, install.onInstall);
    fireEvent.click(installButton());

    await install.fail(undefined);

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
  });

  it("clears the last error when retrying", async () => {
    const install = pendingInstall();
    renderDialog(UPDATE, install.onInstall);
    fireEvent.click(installButton());
    await install.fail("offline");

    fireEvent.click(installButton());

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("re-enables the buttons if the install ever resolves", async () => {
    const onInstall = vi.fn().mockResolvedValue(undefined);
    renderDialog(UPDATE, onInstall);

    await act(async () => fireEvent.click(installButton()));

    expect(installButton()).toBeEnabled();
  });
});
