import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, Group, Vault } from "../../domain";
import { UrlOpener } from "../../application/url-opener";
import { VaultShell } from "./VaultShell";

function fakeUrlOpener(): UrlOpener {
  return { open: vi.fn() };
}

describe("VaultShell", () => {
  it("shows the empty-group message and no Groups section when the vault has no groups or entries", () => {
    const vault = Vault.create("Empty");

    render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={vi.fn()} />);

    expect(screen.getByRole("button", { name: /all items/i })).toBeInTheDocument();
    expect(screen.queryByText("Groups")).not.toBeInTheDocument();
    expect(screen.getByText("No entries in this group.")).toBeInTheDocument();
    expect(screen.getByText("Select an entry to view details")).toBeInTheDocument();
  });

  it("lists top-level groups with their own entry counts, and 'All Items' with the full recursive count", () => {
    const workEntry = Entry.create({ title: "GitHub", username: "octocat" });
    const nestedGroup = Group.create("Nested").addEntry(Entry.create({ title: "Nested Entry" }));
    const work = Group.create("Work").addEntry(workEntry).addGroup(nestedGroup);
    let vault = Vault.create("Mine");
    vault = vault.addGroup(vault.rootGroup.id, work);

    render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={vi.fn()} />);

    expect(screen.getByText("Groups")).toBeInTheDocument();
    // All Items count (recursive: 2) vs Work's own count (1).
    expect(screen.getByRole("button", { name: /all items/i })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /work/i })).toHaveTextContent("1");
  });

  it("filters the entry list to the selected group's own entries only (not nested)", async () => {
    const user = userEvent.setup();
    const workEntry = Entry.create({ title: "GitHub" });
    const nestedGroup = Group.create("Nested").addEntry(Entry.create({ title: "Nested Entry" }));
    const work = Group.create("Work").addEntry(workEntry).addGroup(nestedGroup);
    let vault = Vault.create("Mine");
    vault = vault.addGroup(vault.rootGroup.id, work);

    render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={vi.fn()} />);

    await user.click(screen.getByText("Work"));

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("Nested Entry")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /all items/i }));

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Nested Entry")).toBeInTheDocument();
  });

  it("selects an entry and shows its read-only detail", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({
      title: "GitHub",
      username: "octocat",
      url: "https://github.com",
      notes: "some notes",
    });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={vi.fn()} />);

    await user.click(screen.getByText("GitHub"));

    const detail = within(screen.getByRole("heading", { name: "GitHub" }).closest(".detail-content")!);
    expect(detail.getByText("octocat")).toBeInTheDocument();
    expect(detail.getByText("https://github.com")).toBeInTheDocument();
    expect(detail.getByText("some notes")).toBeInTheDocument();
    expect(detail.getByText("Mine")).toBeInTheDocument(); // group name meta row
  });

  it("does not render a URL button or notes card when the entry has none", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({ title: "No Extras" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={vi.fn()} />);

    await user.click(screen.getByText("No Extras"));

    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
  });

  it("opens the entry's URL via the UrlOpener when clicked", async () => {
    const user = userEvent.setup();
    const urlOpener = fakeUrlOpener();
    const entry = Entry.create({ title: "GitHub", url: "https://github.com" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    render(<VaultShell vault={vault} urlOpener={urlOpener} onLock={vi.fn()} />);

    await user.click(screen.getByText("GitHub"));
    await user.click(screen.getByText("https://github.com"));

    expect(urlOpener.open).toHaveBeenCalledWith("https://github.com");
  });

  it("toggles password reveal for the selected entry, masked by default", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({ title: "GitHub" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={vi.fn()} />);

    await user.click(screen.getByText("GitHub"));

    expect(screen.getByText("••••••••")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.queryByText("••••••••")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.getByText("••••••••")).toBeInTheDocument();
  });

  it("resets the selected entry and reveal state when switching groups", async () => {
    const user = userEvent.setup();
    const rootEntry = Entry.create({ title: "Root Entry" });
    const work = Group.create("Work").addEntry(Entry.create({ title: "Work Entry" }));
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, rootEntry);
    vault = vault.addGroup(vault.rootGroup.id, work);

    render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={vi.fn()} />);

    await user.click(screen.getByText("Root Entry"));
    expect(screen.getByRole("heading", { name: "Root Entry" })).toBeInTheDocument();

    await user.click(screen.getByText("Work"));

    expect(screen.getByText("Select an entry to view details")).toBeInTheDocument();
  });

  it("calls onLock when the lock button is clicked", async () => {
    const user = userEvent.setup();
    const onLock = vi.fn();
    const vault = Vault.create("Mine");

    render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={onLock} />);

    await user.click(screen.getByRole("button", { name: "Lock vault" }));

    expect(onLock).toHaveBeenCalled();
  });

  it("shows a placeholder title for an entry with a blank title", async () => {
    const user = userEvent.setup();
    const entry = Entry.create({ title: "" });
    let vault = Vault.create("Mine");
    vault = vault.addEntry(vault.rootGroup.id, entry);

    render(<VaultShell vault={vault} urlOpener={fakeUrlOpener()} onLock={vi.fn()} />);

    await user.click(screen.getByText("(untitled)"));

    expect(screen.getByRole("heading", { name: "(untitled)" })).toBeInTheDocument();
  });
});
