import { describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomField, CustomFields, Entry, Password, Vault } from "../../../src/domain";
import { ClipboardWriter } from "../../../src/application/clipboard";
import { DEFAULT_SETTINGS, resolveSettings } from "../../../src/application/settings";
import { DEFAULT_SHORTCUTS, ShortcutBindings } from "../../../src/application/shortcuts";
import { UrlOpener } from "../../../src/application/url-opener";
import { VaultMergeSource } from "../../../src/application/vault-merge-source";
import { VaultShell } from "../../../src/ui/screens/VaultShell";
import { fakeVaultFileActions } from "../vault-file-fakes";

function renderShell(
  vault: Vault,
  overrides: { shortcuts?: ShortcutBindings; mergeSource?: Partial<VaultMergeSource> } = {},
) {
  const onLock = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const urlOpener: UrlOpener = { open: vi.fn() };
  const clipboardWriter: ClipboardWriter = { writeText: vi.fn(), clearIfUnchanged: vi.fn() };
  const mergeSource: VaultMergeSource = {
    pickFile: vi.fn(),
    pickKeyFile: vi.fn(),
    openFile: vi.fn(),
    ...overrides.mergeSource,
  };
  render(
    <VaultShell
      vault={vault}
      filePath="C:/vaults/personal.kdbx"
      fileInfo={undefined}
      urlOpener={urlOpener}
      clipboardWriter={clipboardWriter}
      mergeSource={mergeSource}
      settings={{
        ...resolveSettings(DEFAULT_SETTINGS),
        shortcuts: overrides.shortcuts ?? DEFAULT_SHORTCUTS,
      }}
      onSettingChange={vi.fn()}
      onLock={onLock}
      onSave={onSave}
      vaultFileActions={fakeVaultFileActions()}
      onExportSettings={vi.fn()}
      onImportSettings={vi.fn()}
      onExportAttachment={vi.fn()}
      onVaultChange={vi.fn()}
    />,
  );
  return { onLock, onSave, urlOpener, clipboardWriter };
}

const GITHUB = Entry.create({
  title: "GitHub",
  username: "octocat",
  password: new Password("hunter2"),
  url: "github.com/login",
  customFields: new CustomFields([
    new CustomField("otp", "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP", true),
  ]),
});
const MAIL = Entry.create({ title: "Mail", username: "me@example.com" });
const WIFI = Entry.create({ title: "Wi-Fi" });

function vaultWith(...entries: Entry[]): Vault {
  let vault = Vault.create("Mine");
  for (const entry of entries) {
    vault = vault.addEntry(vault.rootGroup.id, entry);
  }
  return vault;
}

/** The entry rows, in list order. */
function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".entry-row"));
}

function row(title: string): HTMLElement {
  return rows().find((element) => element.textContent?.includes(title))!;
}

/** Presses a combination on the document and says whether Argus claimed it. */
function claims(init: KeyboardEventInit): boolean {
  const event = createEvent.keyDown(document, init);
  fireEvent(document, event);
  return event.defaultPrevented;
}

describe("VaultShell keyboard shortcuts", () => {
  describe("anywhere in the vault", () => {
    it("locks with Ctrl+L", async () => {
      const { onLock } = renderShell(vaultWith());

      await userEvent.keyboard("{Control>}l{/Control}");

      expect(onLock).toHaveBeenCalledTimes(1);
    });

    it("opens the generator with Ctrl+G and settings with Ctrl+,", async () => {
      renderShell(vaultWith());

      await userEvent.keyboard("{Control>}g{/Control}");
      expect(screen.getByRole("heading", { name: "Password Generator" })).toBeInTheDocument();

      // user-event's keyboard map has no physical key for the comma.
      expect(claims({ code: "Comma", ctrlKey: true })).toBe(true);
      expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    });

    it("starts a new entry with Ctrl+N, from another view too", async () => {
      renderShell(vaultWith(GITHUB));
      await userEvent.click(screen.getByRole("button", { name: "Settings" }));

      await userEvent.keyboard("{Control>}n{/Control}");

      expect(screen.getByLabelText("Title")).toHaveValue("");
    });

    it("leaves the recycle bin to start a new entry, as the bin has nowhere to show the form", async () => {
      const vault = vaultWith(GITHUB).deleteEntry(GITHUB.id);
      renderShell(vault);
      await userEvent.click(screen.getByText("Recycle Bin"));

      await userEvent.keyboard("{Control>}n{/Control}");

      expect(screen.getByRole("heading", { name: "All Items" })).toBeInTheDocument();
      expect(screen.getByLabelText("Title")).toBeInTheDocument();
    });

    it("follows the user's own bindings", async () => {
      const { onLock } = renderShell(vaultWith(), {
        shortcuts: { ...DEFAULT_SHORTCUTS, lock: "Alt+L" },
      });

      await userEvent.keyboard("{Control>}l{/Control}");
      expect(onLock).not.toHaveBeenCalled();

      await userEvent.keyboard("{Alt>}l{/Alt}");
      expect(onLock).toHaveBeenCalledTimes(1);
    });

    it("leaves plain Ctrl+C to copying whatever is selected", () => {
      const { clipboardWriter } = renderShell(vaultWith(GITHUB));
      fireEvent.click(row("GitHub"));

      expect(claims({ code: "KeyC", ctrlKey: true })).toBe(false);
      expect(clipboardWriter.writeText).not.toHaveBeenCalled();
    });
  });

  describe("on the selected entry", () => {
    it("copies the username with Ctrl+B and the password with Ctrl+Shift+C", async () => {
      const { clipboardWriter } = renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));

      await userEvent.keyboard("{Control>}b{/Control}");
      expect(clipboardWriter.writeText).toHaveBeenLastCalledWith("octocat");

      await userEvent.keyboard("{Control>}{Shift>}c{/Shift}{/Control}");
      expect(clipboardWriter.writeText).toHaveBeenLastCalledWith("hunter2");
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    it("copies the current authenticator code with Ctrl+T", async () => {
      const { clipboardWriter } = renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));

      await userEvent.keyboard("{Control>}t{/Control}");

      await vi.waitFor(() =>
        expect(clipboardWriter.writeText).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/)),
      );
    });

    it("copies the URL with Ctrl+U, and says so next to it", async () => {
      const { clipboardWriter } = renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));

      await userEvent.keyboard("{Control>}u{/Control}");

      expect(clipboardWriter.writeText).toHaveBeenCalledWith("github.com/login");
      expect(await screen.findByText("Copied")).toBeInTheDocument();
    });

    it("opens the URL in the browser with Ctrl+Shift+U", async () => {
      const { urlOpener } = renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));

      await userEvent.keyboard("{Control>}{Shift>}u{/Shift}{/Control}");

      expect(urlOpener.open).toHaveBeenCalledWith("https://github.com/login");
    });

    it("leaves the URL and authenticator keys alone for an entry that has neither", async () => {
      const { clipboardWriter, urlOpener } = renderShell(vaultWith(MAIL));
      await userEvent.click(row("Mail"));

      expect(claims({ code: "KeyU", ctrlKey: true })).toBe(false);
      expect(claims({ code: "KeyU", ctrlKey: true, shiftKey: true })).toBe(false);
      expect(claims({ code: "KeyT", ctrlKey: true })).toBe(false);

      expect(clipboardWriter.writeText).not.toHaveBeenCalled();
      expect(urlOpener.open).not.toHaveBeenCalled();
    });

    it("shows and hides the password with Ctrl+H", async () => {
      renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));

      await userEvent.keyboard("{Control>}h{/Control}");
      expect(screen.getByText("hunter2")).toBeInTheDocument();

      await userEvent.keyboard("{Control>}h{/Control}");
      expect(screen.queryByText("hunter2")).not.toBeInTheDocument();
    });

    it("opens the editor with Ctrl+E", async () => {
      renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));

      await userEvent.keyboard("{Control>}e{/Control}");

      expect(screen.getByLabelText("Title")).toHaveValue("GitHub");
    });

    it("asks before deleting with Delete, and deletes once confirmed", async () => {
      const { onSave } = renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));

      await userEvent.keyboard("{Delete}");
      expect(onSave).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      expect(onSave).toHaveBeenCalledTimes(1);
      const saved: Vault = onSave.mock.calls[0][0];
      expect(saved.recycleBin?.entries.map((entry) => entry.title)).toEqual(["GitHub"]);
    });

    it("drops the delete question on Cancel", async () => {
      renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));
      await userEvent.click(screen.getByRole("button", { name: "Delete entry" }));

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("Delete this entry?")).not.toBeInTheDocument();
    });

    it("drops the delete question when another entry is selected, and doesn't bring it back", async () => {
      renderShell(vaultWith(GITHUB, MAIL));
      await userEvent.click(row("GitHub"));
      await userEvent.keyboard("{Delete}");
      expect(screen.getByText("Delete this entry?")).toBeInTheDocument();

      await userEvent.click(row("Mail"));
      expect(screen.queryByText("Delete this entry?")).not.toBeInTheDocument();

      await userEvent.click(row("GitHub"));
      expect(screen.queryByText("Delete this entry?")).not.toBeInTheDocument();
    });

    it("drops the delete question when the editor is opened and closed again", async () => {
      renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));
      await userEvent.keyboard("{Delete}");

      await userEvent.click(screen.getByRole("button", { name: "Edit entry" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("Delete this entry?")).not.toBeInTheDocument();
    });

    it("treats Delete as text while typing in the search box", async () => {
      renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));

      await userEvent.type(screen.getByLabelText("Search entries"), "git{Delete}");

      expect(screen.queryByText("Delete this entry?")).not.toBeInTheDocument();
    });

    it("does nothing without a selected entry", () => {
      renderShell(vaultWith(GITHUB));

      expect(claims({ code: "KeyE", ctrlKey: true })).toBe(false);
      expect(claims({ code: "Delete" })).toBe(false);
      expect(claims({ code: "KeyB", ctrlKey: true })).toBe(false);
    });

    it("does nothing while the entry is being edited or another view is up", async () => {
      renderShell(vaultWith(GITHUB));
      await userEvent.click(row("GitHub"));

      await userEvent.keyboard("{Control>}e{/Control}");
      expect(claims({ code: "KeyB", ctrlKey: true })).toBe(false);

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(claims({ code: "KeyB", ctrlKey: true })).toBe(false);
    });
  });

  describe("in the entry form", () => {
    it("saves with Ctrl+S", async () => {
      const { onSave } = renderShell(vaultWith());
      await userEvent.keyboard("{Control>}n{/Control}");
      await userEvent.type(screen.getByLabelText("Title"), "Bank");

      await userEvent.keyboard("{Control>}s{/Control}");

      expect(onSave).toHaveBeenCalledTimes(1);
      const saved: Vault = onSave.mock.calls[0][0];
      expect(saved.rootGroup.entries.map((entry) => entry.title)).toEqual(["Bank"]);
    });

    it("answers to a save shortcut the user chose", async () => {
      const { onSave } = renderShell(vaultWith(), {
        shortcuts: { ...DEFAULT_SHORTCUTS, saveEntry: "Control+Enter" },
      });
      await userEvent.keyboard("{Control>}n{/Control}");
      await userEvent.type(screen.getByLabelText("Title"), "Bank");

      await userEvent.keyboard("{Control>}{Enter}{/Control}");

      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  describe("while a merge is in progress", () => {
    it("still locks, but leaves every other shortcut alone so the merge isn't abandoned", async () => {
      const { onLock } = renderShell(vaultWith(), {
        mergeSource: { pickFile: vi.fn().mockResolvedValue("C:/vaults/other.kdbx") },
      });
      await userEvent.click(screen.getByRole("button", { name: "Settings" }));
      await userEvent.click(screen.getByRole("button", { name: /merge another vault in/i }));
      expect(screen.getByRole("dialog", { name: /merge another vault in/i })).toBeInTheDocument();

      expect(claims({ code: "KeyG", ctrlKey: true })).toBe(false);
      expect(claims({ code: "KeyN", ctrlKey: true })).toBe(false);
      expect(screen.getByRole("dialog", { name: /merge another vault in/i })).toBeInTheDocument();

      expect(claims({ code: "KeyL", ctrlKey: true })).toBe(true);
      expect(onLock).toHaveBeenCalledTimes(1);
    });
  });

  describe("in the entry list", () => {
    it("moves the selection down from the search box, taking focus along", async () => {
      renderShell(vaultWith(GITHUB, MAIL, WIFI));
      await userEvent.click(screen.getByLabelText("Search entries"));

      await userEvent.keyboard("{ArrowDown}");
      expect(row("GitHub")).toHaveClass("active");
      expect(row("GitHub")).toHaveFocus();

      await userEvent.keyboard("{ArrowDown}");
      expect(row("Mail")).toHaveClass("active");
      expect(row("Mail")).toHaveFocus();
    });

    it("moves back up, and stops at either end of the list", async () => {
      renderShell(vaultWith(GITHUB, MAIL));
      await userEvent.click(row("Mail"));

      await userEvent.keyboard("{ArrowDown}");
      expect(row("Mail")).toHaveClass("active");

      await userEvent.keyboard("{ArrowUp}");
      expect(row("GitHub")).toHaveClass("active");

      await userEvent.keyboard("{ArrowUp}");
      expect(row("GitHub")).toHaveClass("active");
    });

    it("starts from the bottom when moving up with nothing selected", async () => {
      renderShell(vaultWith(GITHUB, MAIL));
      await userEvent.click(screen.getByLabelText("Search entries"));

      await userEvent.keyboard("{ArrowUp}");

      expect(row("Mail")).toHaveClass("active");
    });

    it("selects the first result with Enter in the search box, keeping the caret there", async () => {
      renderShell(vaultWith(GITHUB, MAIL));
      const search = screen.getByLabelText("Search entries");

      await userEvent.type(search, "mail{Enter}");

      expect(row("Mail")).toHaveClass("active");
      expect(search).toHaveFocus();
    });

    it("does nothing on Enter or an arrow key when nothing is listed", async () => {
      renderShell(vaultWith(GITHUB));
      const search = screen.getByLabelText("Search entries");

      await userEvent.type(search, "nothing like this{Enter}{ArrowDown}");

      expect(screen.getByText('No entries match "nothing like this".')).toBeInTheDocument();
      expect(search).toHaveFocus();
    });

    it("clears the search with Escape", async () => {
      renderShell(vaultWith(GITHUB, MAIL));
      const search = screen.getByLabelText("Search entries");
      await userEvent.type(search, "mail");
      expect(rows()).toHaveLength(1);

      await userEvent.keyboard("{Escape}");

      expect(search).toHaveValue("");
      expect(rows()).toHaveLength(2);
    });

    it("leaves other keys on a row alone", async () => {
      renderShell(vaultWith(GITHUB, MAIL));
      await userEvent.click(row("GitHub"));

      await userEvent.keyboard("{Home}");

      expect(row("GitHub")).toHaveClass("active");
    });
  });
});
