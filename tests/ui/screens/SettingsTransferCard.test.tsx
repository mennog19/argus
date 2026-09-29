import { SettingsImportResult } from "../../../src/application/settings-transfer-service";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsTransferCard } from "../../../src/ui/screens/SettingsTransferCard";

function renderCard(
  overrides: {
    onExportSettings?: () => Promise<string | undefined>;
    onImportSettings?: () => Promise<SettingsImportResult | undefined>;
  } = {},
) {
  const onExportSettings = overrides.onExportSettings ?? vi.fn().mockResolvedValue(undefined);
  const onImportSettings = overrides.onImportSettings ?? vi.fn().mockResolvedValue(undefined);
  render(
    <SettingsTransferCard
      onExportSettings={onExportSettings}
      onImportSettings={onImportSettings}
    />,
  );
  return { onExportSettings, onImportSettings };
}

const exportButton = () => screen.getByRole("button", { name: /export settings/i });
const importButton = () => screen.getByRole("button", { name: /import settings/i });

describe("SettingsTransferCard", () => {
  it("exports and names the file it wrote", async () => {
    const user = userEvent.setup();
    const { onExportSettings } = renderCard({
      onExportSettings: vi.fn().mockResolvedValue("C:/share/argus-settings.json"),
    });

    await user.click(exportButton());

    expect(onExportSettings).toHaveBeenCalled();
    expect(
      await screen.findByText("Settings exported to argus-settings.json."),
    ).toBeInTheDocument();
  });

  it("imports and names the file it read", async () => {
    const user = userEvent.setup();
    const { onImportSettings } = renderCard({
      onImportSettings: vi.fn().mockResolvedValue({
        filePath: "C:/share/from-a-friend.json",
        keptContentProtection: false,
      }),
    });

    await user.click(importButton());

    expect(onImportSettings).toHaveBeenCalled();
    expect(
      await screen.findByText("Settings imported from from-a-friend.json."),
    ).toBeInTheDocument();
  });

  it("says when screen-capture protection was kept on despite the file", async () => {
    const user = userEvent.setup();
    renderCard({
      onImportSettings: vi.fn().mockResolvedValue({
        filePath: "C:/share/from-a-friend.json",
        keptContentProtection: true,
      }),
    });

    await user.click(importButton());

    expect(
      await screen.findByText(
        "Settings imported from from-a-friend.json. The file turns screen-capture protection " +
          "off, so that was left on. Switch it off under Security if you meant to.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing when the file dialog is cancelled", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(exportButton());
    await user.click(importButton());

    expect(screen.queryByText(/settings exported/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/settings imported/i)).not.toBeInTheDocument();
  });

  it("shows why an export failed", async () => {
    const user = userEvent.setup();
    renderCard({ onExportSettings: vi.fn().mockRejectedValue(new Error("forbidden path")) });

    await user.click(exportButton());

    expect(await screen.findByText("forbidden path")).toBeInTheDocument();
  });

  it("shows why an import failed", async () => {
    const user = userEvent.setup();
    renderCard({ onImportSettings: vi.fn().mockRejectedValue(new Error("not valid JSON")) });

    await user.click(importButton());

    expect(await screen.findByText("not valid JSON")).toBeInTheDocument();
  });

  it("falls back to a generic message when the failure has none", async () => {
    const user = userEvent.setup();
    renderCard({ onImportSettings: vi.fn().mockRejectedValue(undefined) });

    await user.click(importButton());

    expect(await screen.findByText("Failed to import settings.")).toBeInTheDocument();
  });

  it("replaces the previous result with the latest one", async () => {
    const user = userEvent.setup();
    renderCard({
      onExportSettings: vi.fn().mockResolvedValue("C:/share/argus-settings.json"),
      onImportSettings: vi.fn().mockRejectedValue(new Error("not valid JSON")),
    });

    await user.click(exportButton());
    await user.click(importButton());

    expect(screen.queryByText(/settings exported/i)).not.toBeInTheDocument();
    expect(await screen.findByText("not valid JSON")).toBeInTheDocument();
  });

  it("disables both buttons while a transfer is running", async () => {
    const user = userEvent.setup();
    let finishExport: (path: string | undefined) => void = () => {};
    renderCard({
      onExportSettings: vi
        .fn()
        .mockReturnValue(new Promise<string | undefined>((resolve) => (finishExport = resolve))),
    });

    await user.click(exportButton());

    expect(exportButton()).toBeDisabled();
    expect(importButton()).toBeDisabled();

    finishExport("C:/share/argus-settings.json");
    expect(
      await screen.findByText("Settings exported to argus-settings.json."),
    ).toBeInTheDocument();
    expect(exportButton()).toBeEnabled();
  });
});
