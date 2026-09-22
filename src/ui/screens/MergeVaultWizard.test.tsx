import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, Group, Password, Vault } from "../../domain";
import { VaultMergeSource } from "../../application/vault-merge-source";
import { MergeVaultWizard } from "./MergeVaultWizard";

function fakeMergeSource(overrides: Partial<VaultMergeSource> = {}): VaultMergeSource {
  return { pickAndOpen: vi.fn(), ...overrides };
}

function buildTargetVault() {
  const conflictA = Entry.create({
    title: "Bank",
    username: "alice",
    password: new Password("old-secret"),
  });
  const conflictB = Entry.create({
    title: "Empty PW",
    username: "bob",
    password: new Password(""),
  });
  const identical = Entry.create({ title: "Same", username: "carol", notes: "shared" });
  const vault = new Vault(
    "Mine",
    Group.create("Mine").addEntry(conflictA).addEntry(conflictB).addEntry(identical),
  );
  return { vault, conflictA, conflictB, identical };
}

function buildSourceVault() {
  const conflictA = Entry.create({
    title: "Bank",
    username: "alice",
    password: new Password("new-secret"),
  });
  const conflictB = Entry.create({
    title: "Empty PW",
    username: "bob",
    password: new Password("secret123"),
  });
  const identical = Entry.create({ title: "Same", username: "carol", notes: "shared" });
  const fresh = Entry.create({ title: "New Site", username: "dave" });
  const vault = new Vault(
    "Theirs",
    Group.create("Theirs")
      .addEntry(conflictA)
      .addEntry(conflictB)
      .addEntry(identical)
      .addEntry(fresh),
  );
  return { vault, conflictA, conflictB, identical, fresh };
}

async function unlockToReview(
  mergeSource: VaultMergeSource,
  vault: Vault = buildTargetVault().vault,
  onApply: (vault: Vault) => Promise<void> = vi.fn().mockResolvedValue(undefined),
  onClose = vi.fn(),
) {
  const user = userEvent.setup();
  render(
    <MergeVaultWizard
      vault={vault}
      mergeSource={mergeSource}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  await user.type(screen.getByLabelText(/its master password/i), "theirs-password");
  await user.click(screen.getByRole("button", { name: /choose file & continue/i }));
  return { user, onApply, onClose };
}

describe("MergeVaultWizard", () => {
  it("shows the unlock step by default", () => {
    render(
      <MergeVaultWizard
        vault={Vault.create("Mine")}
        mergeSource={fakeMergeSource()}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /merge another vault in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/its master password/i)).toBeInTheDocument();
  });

  it("closes without opening anything when Cancel is clicked on the unlock step", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const pickAndOpen = vi.fn();
    render(
      <MergeVaultWizard
        vault={Vault.create("Mine")}
        mergeSource={fakeMergeSource({ pickAndOpen })}
        onApply={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(pickAndOpen).not.toHaveBeenCalled();
  });

  it("stays on the unlock step when the user cancels the file dialog", async () => {
    const pickAndOpen = vi.fn().mockResolvedValue(undefined);
    await unlockToReview(fakeMergeSource({ pickAndOpen }));

    expect(pickAndOpen).toHaveBeenCalledWith("theirs-password");
    expect(screen.getByRole("heading", { name: /merge another vault in/i })).toBeInTheDocument();
  });

  it("shows an error when opening the source vault fails", async () => {
    const pickAndOpen = vi.fn().mockRejectedValue(new Error("Incorrect password."));
    await unlockToReview(fakeMergeSource({ pickAndOpen }));

    expect(screen.getByText("Incorrect password.")).toBeInTheDocument();
  });

  it("moves to the review step and computes the merge plan after a successful unlock", async () => {
    const { vault } = buildTargetVault();
    const { vault: sourceVault } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });

    await unlockToReview(fakeMergeSource({ pickAndOpen }), vault);

    expect(
      screen.getByRole("heading", { name: /review merge from second\.kdbx/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("New entries (1)")).toBeInTheDocument();
    expect(screen.getByText("Conflicts (2)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show 1 identical entry/i })).toBeInTheDocument();
  });

  it("defaults new entries to accepted and includes them in the applied merge", async () => {
    const { vault } = buildTargetVault();
    const { vault: sourceVault, fresh } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });
    const onApply = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { user } = await unlockToReview(
      fakeMergeSource({ pickAndOpen }),
      vault,
      onApply,
      onClose,
    );

    const newEntryRow = screen.getByText("New Site").closest("label")!;
    expect(within(newEntryRow).getByRole("checkbox")).toBeChecked();

    await user.click(screen.getByRole("button", { name: /apply merge/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const merged: Vault = onApply.mock.calls[0][0];
    const mergeGroup = merged.rootGroup.groups.find((g) => g.name === "Merged in, to sort by user");
    expect(mergeGroup?.entries.some((e) => e.id.equals(fresh.id))).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it("excludes an unchecked new entry from the applied merge", async () => {
    const { vault } = buildTargetVault();
    const { vault: sourceVault, fresh } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { user } = await unlockToReview(fakeMergeSource({ pickAndOpen }), vault, onApply);

    const newEntryRow = screen.getByText("New Site").closest("label")!;
    const newEntryCheckbox = within(newEntryRow).getByRole("checkbox");
    await user.click(newEntryCheckbox);
    expect(newEntryCheckbox).not.toBeChecked();
    // Re-checking exercises the opposite branch of the toggle.
    await user.click(newEntryCheckbox);
    expect(newEntryCheckbox).toBeChecked();
    await user.click(newEntryCheckbox);

    await user.click(screen.getByRole("button", { name: /apply merge/i }));

    const merged: Vault = onApply.mock.calls[0][0];
    const mergeGroup = merged.rootGroup.groups.find((g) => g.name === "Merged in, to sort by user");
    expect(mergeGroup?.entries.some((e) => e.id.equals(fresh.id)) ?? false).toBe(false);
  });

  it("shows 'Nothing new to import' when there are no new entries", async () => {
    const { vault, conflictA, conflictB, identical } = buildTargetVault();
    const sourceVault = new Vault(
      "Theirs",
      Group.create("Theirs")
        .addEntry(Entry.create({ title: conflictA.title, username: conflictA.username }))
        .addEntry(Entry.create({ title: conflictB.title, username: conflictB.username }))
        .addEntry(
          Entry.create({ title: identical.title, username: identical.username, notes: "shared" }),
        ),
    );
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/x.kdbx" });

    await unlockToReview(fakeMergeSource({ pickAndOpen }), vault);

    expect(screen.getByText("Nothing new to import.")).toBeInTheDocument();
  });

  it("shows 'No conflicting entries' when nothing conflicts", async () => {
    const vault = Vault.create("Mine");
    const sourceVault = new Vault(
      "Theirs",
      Group.create("Theirs").addEntry(Entry.create({ title: "Site", username: "dave" })),
    );
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/x.kdbx" });

    await unlockToReview(fakeMergeSource({ pickAndOpen }), vault);

    expect(screen.getByText("No conflicting entries.")).toBeInTheDocument();
  });

  it("masks a differing password by default and reveals it once 'Show secrets' is checked", async () => {
    const { vault } = buildTargetVault();
    const { vault: sourceVault } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });

    const { user } = await unlockToReview(fakeMergeSource({ pickAndOpen }), vault);

    expect(screen.queryByText("old-secret")).not.toBeInTheDocument();
    expect(screen.getAllByText("••••••••").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("checkbox", { name: /show secrets in diffs/i }));

    expect(screen.getByText("old-secret")).toBeInTheDocument();
    expect(screen.getByText("new-secret")).toBeInTheDocument();
  });

  it("renders an empty target password as blank rather than masked", async () => {
    const { vault } = buildTargetVault();
    const { vault: sourceVault } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });

    await unlockToReview(fakeMergeSource({ pickAndOpen }), vault);

    const conflictCard = screen.getByText("Empty PW").closest<HTMLElement>(".merge-conflict-card")!;
    const passwordRow = within(conflictCard).getByText("Password").closest("tr")!;
    const cells = within(passwordRow).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("");
    expect(cells[2]).toHaveTextContent("••••••••");
  });

  it("defaults a conflict to 'keep mine' and leaves the target entry untouched", async () => {
    const { vault, conflictA } = buildTargetVault();
    const { vault: sourceVault } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { user } = await unlockToReview(fakeMergeSource({ pickAndOpen }), vault, onApply);

    const conflictCard = screen.getByText("Bank").closest<HTMLElement>(".merge-conflict-card")!;
    expect(within(conflictCard).getByRole("radio", { name: "Keep mine" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Switching away and back exercises the "keep mine" click handler too.
    await user.click(within(conflictCard).getByRole("radio", { name: "Use theirs" }));
    await user.click(within(conflictCard).getByRole("radio", { name: "Keep mine" }));

    await user.click(screen.getByRole("button", { name: /apply merge/i }));

    const merged: Vault = onApply.mock.calls[0][0];
    expect(merged.findEntry(conflictA.id)?.password.reveal()).toBe("old-secret");
  });

  it("overwrites the target entry in place when 'Use theirs' is chosen", async () => {
    const { vault, conflictA } = buildTargetVault();
    const { vault: sourceVault } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { user } = await unlockToReview(fakeMergeSource({ pickAndOpen }), vault, onApply);

    const conflictCard = screen.getByText("Bank").closest<HTMLElement>(".merge-conflict-card")!;
    await user.click(within(conflictCard).getByRole("radio", { name: "Use theirs" }));
    await user.click(screen.getByRole("button", { name: /apply merge/i }));

    const merged: Vault = onApply.mock.calls[0][0];
    expect(merged.findEntry(conflictA.id)?.password.reveal()).toBe("new-secret");
    expect(merged.rootGroup.entries).toHaveLength(3);
  });

  it("adds a duplicate into the merge group when 'Keep both' is chosen", async () => {
    const { vault, conflictA } = buildTargetVault();
    const { vault: sourceVault, conflictA: sourceConflictA } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { user } = await unlockToReview(fakeMergeSource({ pickAndOpen }), vault, onApply);

    const conflictCard = screen.getByText("Bank").closest<HTMLElement>(".merge-conflict-card")!;
    await user.click(within(conflictCard).getByRole("radio", { name: "Keep both" }));
    await user.click(screen.getByRole("button", { name: /apply merge/i }));

    const merged: Vault = onApply.mock.calls[0][0];
    expect(merged.findEntry(conflictA.id)?.password.reveal()).toBe("old-secret");
    const mergeGroup = merged.rootGroup.groups.find((g) => g.name === "Merged in, to sort by user");
    expect(mergeGroup?.entries.some((e) => e.id.equals(sourceConflictA.id))).toBe(true);
  });

  it("toggles the identical section open and imports an identical entry only when checked", async () => {
    const { vault, identical } = buildTargetVault();
    const { vault: sourceVault, identical: sourceIdentical } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { user } = await unlockToReview(fakeMergeSource({ pickAndOpen }), vault, onApply);

    expect(screen.queryByText("Same")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show 1 identical entry/i }));
    expect(screen.getByText("Same")).toBeInTheDocument();

    const identicalRow = screen.getByText("Same").closest("label")!;
    const identicalCheckbox = within(identicalRow).getByRole("checkbox");
    await user.click(identicalCheckbox);
    expect(identicalCheckbox).toBeChecked();
    // Unchecking exercises the opposite branch of the toggle.
    await user.click(identicalCheckbox);
    expect(identicalCheckbox).not.toBeChecked();
    await user.click(identicalCheckbox);
    await user.click(screen.getByRole("button", { name: /apply merge/i }));

    const merged: Vault = onApply.mock.calls[0][0];
    const mergeGroup = merged.rootGroup.groups.find((g) => g.name === "Merged in, to sort by user");
    expect(mergeGroup?.entries.some((e) => e.id.equals(sourceIdentical.id))).toBe(true);
    expect(merged.findEntry(identical.id)).toBeDefined();

    await user.click(screen.getByRole("button", { name: /hide 1 identical entry/i }));
    expect(screen.queryByText("Same")).not.toBeInTheDocument();
  });

  it("renders '(untitled)' for new, conflicting, and identical entries with a blank title", async () => {
    const blankConflictTarget = Entry.create({
      username: "x",
      url: "https://blank.example",
      notes: "mine",
    });
    const blankIdenticalTarget = Entry.create({ username: "y", url: "https://blank2.example" });
    const vault = new Vault(
      "Mine",
      Group.create("Mine").addEntry(blankConflictTarget).addEntry(blankIdenticalTarget),
    );
    const blankConflictSource = Entry.create({
      username: "x",
      url: "https://blank.example",
      notes: "theirs",
    });
    const blankIdenticalSource = Entry.create({ username: "y", url: "https://blank2.example" });
    const blankNewSource = Entry.create({ username: "z" });
    const sourceVault = new Vault(
      "Theirs",
      Group.create("Theirs")
        .addEntry(blankConflictSource)
        .addEntry(blankIdenticalSource)
        .addEntry(blankNewSource),
    );
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/x.kdbx" });

    const { user } = await unlockToReview(fakeMergeSource({ pickAndOpen }), vault);

    expect(screen.getAllByText("(untitled)").length).toBe(2);
    await user.click(screen.getByRole("button", { name: /show 1 identical entry/i }));
    expect(screen.getAllByText("(untitled)").length).toBe(3);
  });

  it("shows an error and stays open when applying the merge fails", async () => {
    const { vault } = buildTargetVault();
    const { vault: sourceVault } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });
    const onApply = vi.fn().mockRejectedValue(new Error("Disk is full."));
    const onClose = vi.fn();
    const { user } = await unlockToReview(
      fakeMergeSource({ pickAndOpen }),
      vault,
      onApply,
      onClose,
    );

    await user.click(screen.getByRole("button", { name: /apply merge/i }));

    expect(screen.getByText("Disk is full.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without applying when Cancel is clicked on the review step", async () => {
    const { vault } = buildTargetVault();
    const { vault: sourceVault } = buildSourceVault();
    const pickAndOpen = vi
      .fn()
      .mockResolvedValue({ vault: sourceVault, filePath: "C:/other/Second.kdbx" });
    const onApply = vi.fn();
    const onClose = vi.fn();
    const { user } = await unlockToReview(
      fakeMergeSource({ pickAndOpen }),
      vault,
      onApply,
      onClose,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
