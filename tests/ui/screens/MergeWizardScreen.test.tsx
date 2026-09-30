import { describe, expect, it, Mock, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CustomField,
  CustomFields,
  CustomIcon,
  CustomIcons,
  Entry,
  Group,
  Icon,
  Password,
  Tag,
  Tags,
  Vault,
} from "../../../src/domain";
import { MERGE_GROUP_NAME } from "../../../src/application/apply-vault-merge";
import { MergeWizardScreen } from "../../../src/ui/screens/MergeWizardScreen";

const FILE_PATH = "C:/vaults/other.kdbx";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

function totpFields(secret: string): CustomFields {
  return new CustomFields([new CustomField("otp", `otpauth://totp/Bank?secret=${secret}`)]);
}

function vaultWith(name: string, entries: readonly Entry[]): Vault {
  let root = Group.create(name);
  for (const entry of entries) {
    root = root.addEntry(entry);
  }
  return new Vault(name, root);
}

function renderWizard(
  target: Vault,
  source: Vault,
  overrides: {
    onApply?: Mock;
    onClose?: () => void;
  } = {},
) {
  const onApply = overrides.onApply ?? vi.fn().mockResolvedValue(undefined);
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <MergeWizardScreen
      vault={target}
      filePath={FILE_PATH}
      sourceVault={source}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  return { onApply, onClose };
}

async function goToStep(user: ReturnType<typeof userEvent.setup>, label: string) {
  const step = screen
    .getAllByRole("button")
    .find(
      (button) =>
        button.classList.contains("merge-step-button") && button.textContent?.includes(label),
    );
  await user.click(step!);
}

describe("MergeWizardScreen", () => {
  describe("step 1 — new passwords", () => {
    it("lists entries that share no field, selected by default", () => {
      renderWizard(
        vaultWith("Mine", [Entry.create({ title: "Bank", username: "alice" })]),
        vaultWith("Theirs", [
          Entry.create({ title: "Forum", username: "bob", url: "https://forum.example" }),
        ]),
      );

      expect(screen.getByRole("heading", { name: "New passwords" })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Forum" })).toBeChecked();
      expect(screen.getByText("1 of 1 selected")).toBeInTheDocument();
      expect(screen.getByText("https://forum.example")).toBeInTheDocument();
    });

    it("shows an empty state when nothing is new", () => {
      renderWizard(Vault.create("Mine"), Vault.create("Theirs"));

      expect(
        screen.getByText("The incoming vault has no entries that are new to you."),
      ).toBeInTheDocument();
    });

    it("falls back to placeholder text for a blank title and username", () => {
      renderWizard(Vault.create("Mine"), vaultWith("Theirs", [Entry.create({ url: "x.example" })]));

      expect(screen.getByText("(untitled)")).toBeInTheDocument();
      expect(screen.getByText("No username")).toBeInTheDocument();
    });

    it("lets an unwanted new entry be unselected", async () => {
      const user = userEvent.setup();
      const { onApply } = renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [Entry.create({ title: "Unused", username: "bob" })]),
      );

      await user.click(screen.getByRole("checkbox", { name: "Unused" }));

      expect(screen.getByText("0 of 1 selected")).toBeInTheDocument();

      await goToStep(user, "Review");
      await user.click(screen.getByRole("button", { name: "Apply merge" }));

      await waitFor(() => expect(onApply).toHaveBeenCalled());
      const merged: Vault = onApply.mock.calls[0][0];
      expect(merged.rootGroup.groups).toHaveLength(0);
    });

    it("selects and deselects everything at once", async () => {
      const user = userEvent.setup();
      renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [
          Entry.create({ title: "One", username: "a" }),
          Entry.create({ title: "Two", username: "b" }),
        ]),
      );

      await user.click(screen.getByRole("button", { name: "Select none" }));
      expect(screen.getByText("0 of 2 selected")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Select all" }));
      expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    });
  });

  describe("step 2 — conflicts", () => {
    function conflictingVaults() {
      const mine = vaultWith("Mine", [
        Entry.create({
          title: "Bank",
          username: "alice",
          password: new Password("old-secret"),
          url: "https://bank.example",
          customFields: totpFields(TOTP_SECRET),
        }),
      ]);
      const theirs = vaultWith("Theirs", [
        Entry.create({
          title: "Bank",
          username: "alice",
          password: new Password("new-secret"),
          url: "https://bank.example",
        }),
      ]);
      return { mine, theirs };
    }

    it("collapses agreeing fields to one row and splits only the differences", async () => {
      const user = userEvent.setup();
      const { mine, theirs } = conflictingVaults();
      renderWizard(mine, theirs);
      await goToStep(user, "Conflicts");

      const card = screen.getByRole("article");
      // Title, username and URL agree, so each collapses to one shared value.
      const same = card.querySelectorAll(".merge-ledger-row.same");
      expect(same).toHaveLength(3);
      expect(same[0]).toHaveTextContent("TitleBank");
      // Password and authenticator differ, so both sides are shown.
      expect(card.querySelectorAll(".merge-ledger-row.differs")).toHaveLength(2);
      expect(within(card).getByText("2 differences")).toBeInTheDocument();
    });

    it("says 'difference' in the singular for a single differing field", async () => {
      const user = userEvent.setup();
      renderWizard(
        vaultWith("Mine", [
          Entry.create({ title: "Bank", username: "alice", password: new Password("old") }),
        ]),
        vaultWith("Theirs", [
          Entry.create({ title: "Bank", username: "alice", password: new Password("new") }),
        ]),
      );
      await goToStep(user, "Conflicts");

      expect(screen.getByText("1 difference")).toBeInTheDocument();
    });

    it("masks secrets until they are revealed", async () => {
      const user = userEvent.setup();
      const { mine, theirs } = conflictingVaults();
      renderWizard(mine, theirs);
      await goToStep(user, "Conflicts");

      expect(screen.getAllByText("••••••••")).toHaveLength(2);
      expect(screen.getByText("Configured")).toBeInTheDocument();
      expect(screen.getByText("Not set")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Show secrets" }));

      expect(screen.getByText("old-secret")).toBeInTheDocument();
      expect(screen.getByText("new-secret")).toBeInTheDocument();
      expect(screen.getByText(`${TOTP_SECRET}:SHA1:6:30`)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Hide secrets" }));

      expect(screen.queryByText("old-secret")).not.toBeInTheDocument();
    });

    it("renders a dash for a field neither entry has filled in", async () => {
      const user = userEvent.setup();
      renderWizard(
        vaultWith("Mine", [
          Entry.create({ title: "Bank", username: "alice", password: new Password("old") }),
        ]),
        vaultWith("Theirs", [
          Entry.create({ title: "Bank", username: "alice", password: new Password("new") }),
        ]),
      );
      await goToStep(user, "Conflicts");

      // URL is blank on both sides and agrees, so it collapses to a dash.
      expect(screen.getAllByText("—")).toHaveLength(1);
    });

    it("keeps mine by default, importing nothing", async () => {
      const user = userEvent.setup();
      const { mine, theirs } = conflictingVaults();
      const { onApply } = renderWizard(mine, theirs);
      await goToStep(user, "Conflicts");

      expect(screen.getByRole("radio", { name: /keep mine/i })).toHaveAttribute(
        "aria-checked",
        "true",
      );

      await goToStep(user, "Review");
      await user.click(screen.getByRole("button", { name: "Apply merge" }));

      await waitFor(() => expect(onApply).toHaveBeenCalled());
      const merged: Vault = onApply.mock.calls[0][0];
      expect(merged.rootGroup.entries[0].password.reveal()).toBe("old-secret");
      expect(merged.rootGroup.groups).toHaveLength(0);
    });

    it("overwrites the existing entry when 'use theirs' is chosen", async () => {
      const user = userEvent.setup();
      const { mine, theirs } = conflictingVaults();
      const { onApply } = renderWizard(mine, theirs);
      await goToStep(user, "Conflicts");

      await user.click(screen.getByRole("radio", { name: /use theirs/i }));
      await goToStep(user, "Review");
      await user.click(screen.getByRole("button", { name: "Apply merge" }));

      await waitFor(() => expect(onApply).toHaveBeenCalled());
      const merged: Vault = onApply.mock.calls[0][0];
      expect(merged.rootGroup.entries[0].password.reveal()).toBe("new-secret");
    });

    it("imports a second copy when 'keep both' is chosen", async () => {
      const user = userEvent.setup();
      const { mine, theirs } = conflictingVaults();
      const { onApply } = renderWizard(mine, theirs);
      await goToStep(user, "Conflicts");

      await user.click(screen.getByRole("radio", { name: /keep both/i }));
      await goToStep(user, "Review");
      await user.click(screen.getByRole("button", { name: "Apply merge" }));

      await waitFor(() => expect(onApply).toHaveBeenCalled());
      const merged: Vault = onApply.mock.calls[0][0];
      const mergedGroup = merged.rootGroup.groups.find((g) => g.name === MERGE_GROUP_NAME);
      expect(mergedGroup?.entries[0].password.reveal()).toBe("new-secret");
      expect(merged.rootGroup.entries[0].password.reveal()).toBe("old-secret");
    });

    it("applies one resolution to every conflict at once", async () => {
      const user = userEvent.setup();
      renderWizard(
        vaultWith("Mine", [
          Entry.create({ title: "Bank", username: "alice", password: new Password("old-a") }),
          Entry.create({ title: "Forum", username: "bob", password: new Password("old-b") }),
        ]),
        vaultWith("Theirs", [
          Entry.create({ title: "Bank", username: "alice", password: new Password("new-a") }),
          Entry.create({ title: "Forum", username: "bob", password: new Password("new-b") }),
        ]),
      );
      await goToStep(user, "Conflicts");

      await user.click(screen.getByRole("button", { name: "Use theirs for all" }));
      expect(screen.getByText("2 of 2 importing")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Keep mine for all" }));
      expect(screen.getByText("0 of 2 importing")).toBeInTheDocument();
    });

    it("shows an empty state when nothing conflicts", async () => {
      const user = userEvent.setup();
      renderWizard(Vault.create("Mine"), Vault.create("Theirs"));
      await goToStep(user, "Conflicts");

      expect(
        screen.getByText("Nothing conflicts — every match was identical."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Use theirs for all" })).not.toBeInTheDocument();
    });

    it("falls back to the incoming entry's title and username when mine are blank", async () => {
      const user = userEvent.setup();
      renderWizard(
        vaultWith("Mine", [
          Entry.create({
            username: "bob",
            url: "https://x.example",
            password: new Password("old"),
          }),
        ]),
        vaultWith("Theirs", [
          Entry.create({
            title: "Named",
            username: "bob",
            url: "https://x.example",
            password: new Password("new"),
          }),
        ]),
      );
      await goToStep(user, "Conflicts");

      const heading = screen.getByRole("article").querySelector(".merge-conflict-heading")!;
      expect(
        within(heading as HTMLElement).getByRole("heading", { name: "Named" }),
      ).toBeInTheDocument();
      expect(heading).toHaveTextContent("bob");
    });

    it("falls back to placeholders when neither side has a title or username", async () => {
      const user = userEvent.setup();
      renderWizard(
        vaultWith("Mine", [
          Entry.create({ url: "https://x.example", password: new Password("old") }),
        ]),
        vaultWith("Theirs", [
          Entry.create({ url: "https://x.example", password: new Password("new") }),
        ]),
      );
      await goToStep(user, "Conflicts");

      const card = screen.getByRole("article");
      expect(within(card).getByRole("heading", { name: "(untitled)" })).toBeInTheDocument();
      expect(within(card).getByText("No username")).toBeInTheDocument();
    });
  });

  describe("step 3 — exact duplicates", () => {
    function duplicateVaults() {
      const fields = { title: "Bank", username: "alice", password: new Password("same") };
      return {
        mine: vaultWith("Mine", [Entry.create(fields)]),
        theirs: vaultWith("Theirs", [Entry.create(fields)]),
      };
    }

    it("lists duplicates unselected by default", async () => {
      const user = userEvent.setup();
      const { mine, theirs } = duplicateVaults();
      renderWizard(mine, theirs);
      await goToStep(user, "Duplicates");

      expect(screen.getByRole("heading", { name: "Exact duplicates" })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Bank" })).not.toBeChecked();
      expect(screen.getByText("0 of 1 selected")).toBeInTheDocument();
    });

    it("imports a duplicate as a second copy once it is checked", async () => {
      const user = userEvent.setup();
      const { mine, theirs } = duplicateVaults();
      const { onApply } = renderWizard(mine, theirs);
      await goToStep(user, "Duplicates");

      await user.click(screen.getByRole("checkbox", { name: "Bank" }));
      await goToStep(user, "Review");
      await user.click(screen.getByRole("button", { name: "Apply merge" }));

      await waitFor(() => expect(onApply).toHaveBeenCalled());
      const merged: Vault = onApply.mock.calls[0][0];
      const mergedGroup = merged.rootGroup.groups.find((g) => g.name === MERGE_GROUP_NAME);
      expect(mergedGroup?.entries).toHaveLength(1);
    });

    it("selects and deselects every duplicate at once", async () => {
      const user = userEvent.setup();
      const { mine, theirs } = duplicateVaults();
      renderWizard(mine, theirs);
      await goToStep(user, "Duplicates");

      await user.click(screen.getByRole("button", { name: "Select all" }));
      expect(screen.getByText("1 of 1 selected")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Select none" }));
      expect(screen.getByText("0 of 1 selected")).toBeInTheDocument();
    });

    it("shows an empty state when there are no duplicates", async () => {
      const user = userEvent.setup();
      renderWizard(Vault.create("Mine"), Vault.create("Theirs"));
      await goToStep(user, "Duplicates");

      expect(screen.getByText("No exact duplicates between the two vaults.")).toBeInTheDocument();
    });
  });

  describe("step 4 — review", () => {
    it("tallies every outcome from the earlier steps", async () => {
      const user = userEvent.setup();
      const shared = { title: "Dupe", username: "dupe", password: new Password("same") };
      renderWizard(
        vaultWith("Mine", [
          Entry.create({ title: "Bank", username: "alice", password: new Password("old") }),
          Entry.create(shared),
        ]),
        vaultWith("Theirs", [
          Entry.create({ title: "Bank", username: "alice", password: new Password("new") }),
          Entry.create(shared),
          Entry.create({ title: "Brand New", username: "new-user" }),
        ]),
      );
      await goToStep(user, "Conflicts");
      await user.click(screen.getByRole("radio", { name: /use theirs/i }));
      await goToStep(user, "Review");

      const tallies = document.querySelectorAll(".merge-tally-card");
      expect(tallies).toHaveLength(4);
      expect(tallies[0]).toHaveTextContent("1Imported as new");
      expect(tallies[1]).toHaveTextContent("1Overwritten");
      expect(tallies[2]).toHaveTextContent("0Copies kept");
      expect(tallies[3]).toHaveTextContent("1Left out");
    });

    it("names the group imported entries land in", async () => {
      const user = userEvent.setup();
      renderWizard(Vault.create("Mine"), Vault.create("Theirs"));
      await goToStep(user, "Review");

      expect(screen.getByText(new RegExp(MERGE_GROUP_NAME))).toBeInTheDocument();
    });

    it("explains each outcome list when it is empty", async () => {
      const user = userEvent.setup();
      renderWizard(Vault.create("Mine"), Vault.create("Theirs"));
      await goToStep(user, "Review");

      expect(screen.getByText("No new entries selected.")).toBeInTheDocument();
      expect(screen.getByText("No entries will be overwritten.")).toBeInTheDocument();
      expect(screen.getByText("No duplicate copies will be created.")).toBeInTheDocument();
      expect(
        screen.getByText("Everything from the incoming vault is being imported."),
      ).toBeInTheDocument();
    });

    it("lists the entries left out", async () => {
      const user = userEvent.setup();
      renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [Entry.create({ title: "Unused", username: "bob" })]),
      );
      await user.click(screen.getByRole("checkbox", { name: "Unused" }));
      await goToStep(user, "Review");

      const leftOut = screen.getByText("Left out (1)").parentElement!;
      expect(within(leftOut).getByText("Unused")).toBeInTheDocument();
    });

    it("opens the full entry behind an outcome row and closes it again", async () => {
      const user = userEvent.setup();
      renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [
          Entry.create({
            title: "Bank",
            username: "alice",
            password: new Password("s3cret"),
            url: "https://bank.example",
            notes: "Recovery codes in the safe",
            tags: new Tags([new Tag("finance"), new Tag("shared")]),
            customFields: new CustomFields([
              new CustomField("otp", `otpauth://totp/Bank?secret=${TOTP_SECRET}`),
              new CustomField("Account number", "123456"),
            ]),
          }),
        ]),
      );
      await goToStep(user, "Review");

      const imported = screen.getByText("Imported as new (1)").parentElement!;
      await user.click(within(imported).getByRole("button", { name: /Bank/ }));

      const dialog = screen.getByRole("dialog", { name: "Entry Bank" });
      // Once as the header subtitle, once as the Username row.
      expect(within(dialog).getAllByText("alice")).toHaveLength(2);
      expect(within(dialog).getByText("https://bank.example")).toBeInTheDocument();
      expect(within(dialog).getByText("finance, shared")).toBeInTheDocument();
      expect(within(dialog).getByText("Recovery codes in the safe")).toBeInTheDocument();
      // The `otp` field is already reported as "Authenticator", so it is not
      // repeated as a raw custom field.
      expect(within(dialog).getByText("Account number")).toBeInTheDocument();
      expect(within(dialog).queryByText("otp")).not.toBeInTheDocument();
      expect(within(dialog).getByText("Configured")).toBeInTheDocument();
      expect(within(dialog).getByText("••••••••")).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Close" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("reveals the previewed entry's secrets when secrets are shown", async () => {
      const user = userEvent.setup();
      renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [
          Entry.create({ title: "Bank", username: "alice", password: new Password("s3cret") }),
        ]),
      );
      await user.click(screen.getByRole("button", { name: "Show secrets" }));
      await goToStep(user, "Review");

      const imported = screen.getByText("Imported as new (1)").parentElement!;
      await user.click(within(imported).getByRole("button", { name: /Bank/ }));

      expect(within(screen.getByRole("dialog")).getByText("s3cret")).toBeInTheDocument();
    });

    it("falls back to placeholders for an entry with nothing but a URL", async () => {
      const user = userEvent.setup();
      renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [Entry.create({ url: "https://x.example" })]),
      );
      await goToStep(user, "Review");

      const imported = screen.getByText("Imported as new (1)").parentElement!;
      await user.click(within(imported).getByRole("button", { name: /untitled/ }));

      const dialog = screen.getByRole("dialog", { name: "Entry (untitled)" });
      expect(within(dialog).getByText("No username")).toBeInTheDocument();
      expect(within(dialog).getByText("Not set")).toBeInTheDocument();
      // Username, password, tags and notes are all blank, so each reads as a dash.
      expect(within(dialog).getAllByText("—")).toHaveLength(4);
    });

    it("closes the preview when the backdrop is clicked but not the dialog itself", async () => {
      const user = userEvent.setup();
      renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [Entry.create({ title: "Bank", username: "alice" })]),
      );
      await goToStep(user, "Review");

      const imported = screen.getByText("Imported as new (1)").parentElement!;
      await user.click(within(imported).getByRole("button", { name: /Bank/ }));

      await user.click(screen.getByRole("dialog"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.click(document.querySelector(".modal-overlay")!);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("falls back to a placeholder title in the outcome lists", async () => {
      const user = userEvent.setup();
      renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [Entry.create({ username: "bob", url: "https://x.example" })]),
      );
      await goToStep(user, "Review");

      const imported = screen.getByText("Imported as new (1)").parentElement!;
      expect(within(imported).getByText("(untitled)")).toBeInTheDocument();
    });

    it("closes once the merge is applied", async () => {
      const user = userEvent.setup();
      const { onClose } = renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [Entry.create({ title: "New", username: "bob" })]),
      );
      await goToStep(user, "Review");
      await user.click(screen.getByRole("button", { name: "Apply merge" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it("reports a failed save and stays open", async () => {
      const user = userEvent.setup();
      const { onClose } = renderWizard(
        Vault.create("Mine"),
        vaultWith("Theirs", [Entry.create({ title: "New", username: "bob" })]),
        { onApply: vi.fn().mockRejectedValue(new Error("Disk is full")) },
      );
      await goToStep(user, "Review");
      await user.click(screen.getByRole("button", { name: "Apply merge" }));

      expect(await screen.findByText("Disk is full")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("navigation", () => {
    it("walks forward and back through the steps", async () => {
      const user = userEvent.setup();
      renderWizard(Vault.create("Mine"), Vault.create("Theirs"));

      expect(screen.getByRole("heading", { name: "New passwords" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("heading", { name: "Conflicts" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("heading", { name: "Exact duplicates" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByRole("heading", { name: "Exact duplicates" })).toBeInTheDocument();
    });

    it("marks the current step and the ones already passed", async () => {
      const user = userEvent.setup();
      renderWizard(Vault.create("Mine"), Vault.create("Theirs"));
      await user.click(screen.getByRole("button", { name: "Next" }));

      const steps = document.querySelectorAll(".merge-step");
      expect(steps[0].className).toContain("done");
      expect(steps[1].className).toContain("current");
      expect(steps[2].className).not.toContain("current");
      expect(steps[1].querySelector("button")).toHaveAttribute("aria-current", "step");
    });

    it("jumps straight to a step from the stepper", async () => {
      const user = userEvent.setup();
      renderWizard(Vault.create("Mine"), Vault.create("Theirs"));

      await goToStep(user, "Duplicates");

      expect(screen.getByRole("heading", { name: "Exact duplicates" })).toBeInTheDocument();
    });

    it("abandons the merge when cancelled from the wizard", async () => {
      const user = userEvent.setup();
      const { onApply, onClose } = renderWizard(Vault.create("Mine"), Vault.create("Theirs"));

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalled();
      expect(onApply).not.toHaveBeenCalled();
    });
  });

  describe("custom icons", () => {
    const shared = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000abcd", new Uint8Array([1]));
    const theirs = new CustomIcon("0a1b2c3d-0000-4000-8000-00000000ef01", new Uint8Array([2]));

    it("shows incoming entries' images and brings them over with the merge", async () => {
      const user = userEvent.setup();
      const target = Vault.create("Mine").addCustomIcon(shared);
      const incoming = Entry.create({
        title: "Logo Site",
        username: "bob",
        icon: Icon.custom(theirs.id),
      });
      const source = new Vault(
        "Theirs",
        Group.create("Theirs").addEntry(incoming),
        undefined,
        [],
        new CustomIcons([shared, theirs]),
      );
      const { onApply } = renderWizard(target, source);

      expect(document.querySelector(".entry-tile-custom img")).toBeInTheDocument();

      await goToStep(user, "Review");
      await user.click(screen.getByRole("button", { name: "Apply merge" }));

      await waitFor(() => expect(onApply).toHaveBeenCalled());
      const merged: Vault = onApply.mock.calls[0][0];
      expect(merged.customIcons.values).toEqual([shared, theirs]);
    });
  });
});
