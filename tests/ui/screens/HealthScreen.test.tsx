import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, Group, Password } from "../../../src/domain";
import { EntryWithGroup } from "../../../src/ui/vault-browsing";
import { HealthScreen } from "../../../src/ui/screens/HealthScreen";

const STRONG_PASSWORD = "Correct-Horse-7!";
const OTHER_STRONG_PASSWORD = "Battery-Staple-9!";
const FAIR_PASSWORD = "Correct-Horse7";
const WEAK_PASSWORD = "abc";
const OTHER_WEAK_PASSWORD = "xyz";

function entryIn(group: Group, fields: Parameters<typeof Entry.create>[0] = {}): EntryWithGroup {
  return { entry: Entry.create(fields), group };
}

function tileFor(label: string) {
  return screen.getByText(label).closest("button") as HTMLButtonElement;
}

function overviewRowFor(heading: string) {
  return screen.getByText(heading).closest("li") as HTMLLIElement;
}

describe("HealthScreen", () => {
  it("shows an empty state when there are no entries yet", () => {
    render(<HealthScreen entries={[]} onSelectEntry={vi.fn()} />);

    expect(screen.getByText(/no entries to check yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Reused")).not.toBeInTheDocument();
  });

  it("shows a count tile for each category and a healthy-count summary", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
      entryIn(group, { title: "Fair Site", password: new Password(FAIR_PASSWORD) }),
      entryIn(group, { title: "Strong Site", password: new Password(STRONG_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(screen.getByText(/2 of 3 passwords are healthy/i)).toBeInTheDocument();
    expect(tileFor("Healthy")).toHaveTextContent("67%");
    expect(tileFor("Reused")).toHaveTextContent("0");
    expect(tileFor("Weak")).toHaveTextContent("1");
    expect(tileFor("Fair")).toHaveTextContent("1");
    expect(tileFor("Strong")).toHaveTextContent("1");
  });

  it("leaves out entries whose password is a {REF:…} to another entry's", () => {
    const group = Group.create("Personal");
    const target = entryIn(group, { title: "Main", password: new Password(STRONG_PASSWORD) });
    const reference = target.entry.id.toString().replace(/-/g, "");
    const linked = entryIn(group, {
      title: "Linked",
      password: new Password(`{REF:P@I:${reference}}`),
    });

    render(<HealthScreen entries={[target, linked]} onSelectEntry={vi.fn()} />);

    expect(screen.getByText(/1 of 1 passwords are healthy/i)).toBeInTheDocument();
    expect(tileFor("Reused")).toHaveTextContent("0");
  });

  it("leaves entries without a password out of the rating, listing them on their own", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Signs in with Google" }),
      entryIn(group, { title: "Strong Site", password: new Password(STRONG_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(
      screen.getByText("1 of 1 passwords are healthy. 1 entry has no password and isn't rated."),
    ).toBeInTheDocument();
    expect(tileFor("Healthy")).toHaveTextContent("100%");
    expect(tileFor("Weak")).toHaveTextContent("0");
    expect(tileFor("No password")).toHaveTextContent("1");
    expect(screen.getByText("Every password looks healthy.")).toBeInTheDocument();
    expect(overviewRowFor("Entries without a password")).toHaveTextContent("50%");

    await user.click(tileFor("No password"));
    expect(screen.getByText("Signs in with Google")).toBeInTheDocument();
  });

  it("rates nothing when no entry has a password", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Signs in with Google" }),
      entryIn(group, { title: "Signs in with Apple" }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(
      screen.getByText(
        "0 of 0 passwords are healthy. 2 entries have no password and aren't rated.",
      ),
    ).toBeInTheDocument();
    expect(tileFor("Healthy")).toHaveTextContent("0%");
  });

  it("opens on an overview of every category instead of one category's entries", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
      entryIn(group, { title: "Fair Site", password: new Password(FAIR_PASSWORD) }),
      entryIn(group, { title: "Strong Site", password: new Password(STRONG_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(tileFor("Healthy")).toHaveTextContent("67%");
    expect(overviewRowFor("Reused passwords")).toHaveTextContent("0%");
    expect(overviewRowFor("Weak passwords")).toHaveTextContent("33%");
    expect(overviewRowFor("Fair passwords")).toHaveTextContent("33%");
    expect(overviewRowFor("Strong passwords")).toHaveTextContent("33%");
    expect(screen.getByText(/pick a category above/i)).toBeInTheDocument();
    expect(screen.queryByText("Weak Site")).not.toBeInTheDocument();
  });

  it("counts reused and weak passwords as the ones needing attention", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
      entryIn(group, { title: "Other Weak Site", password: new Password(OTHER_WEAK_PASSWORD) }),
      entryIn(group, { title: "Strong Site", password: new Password(STRONG_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(screen.getByText("2 passwords need attention.")).toBeInTheDocument();
  });

  it("puts the attention note in the singular for a single unhealthy password", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
      entryIn(group, { title: "Strong Site", password: new Password(STRONG_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(screen.getByText("1 password needs attention.")).toBeInTheDocument();
  });

  it("reports a clean bill of health when nothing needs attention", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Strong Site", password: new Password(STRONG_PASSWORD) }),
      entryIn(group, { title: "Other Strong Site", password: new Password(OTHER_STRONG_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(tileFor("Healthy")).toHaveTextContent("100%");
    expect(screen.getByText("Every password looks healthy.")).toBeInTheDocument();
  });

  it("lists reused passwords grouped together when the reused tile is picked", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const shared = WEAK_PASSWORD;
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "GitHub", password: new Password(shared) }),
      entryIn(group, { title: "GitLab", password: new Password(shared) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(tileFor("Reused")).toHaveTextContent("2");
    expect(tileFor("Weak")).toHaveTextContent("0");

    await user.click(tileFor("Reused"));

    expect(screen.getByText("Reused passwords")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("GitLab")).toBeInTheDocument();
  });

  it("switches the visible list when a different stat tile is clicked", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
      entryIn(group, { title: "Strong Site", password: new Password(STRONG_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    await user.click(tileFor("Weak"));

    expect(screen.getByText("Weak Site")).toBeInTheDocument();

    await user.click(tileFor("Strong"));

    expect(screen.getByText("Strong passwords")).toBeInTheDocument();
    expect(screen.getByText("Strong Site")).toBeInTheDocument();
    expect(screen.queryByText("Weak Site")).not.toBeInTheDocument();
  });

  it("returns to the overview when clicking the already-selected tile", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    await user.click(tileFor("Weak"));

    expect(screen.getByText("Weak Site")).toBeInTheDocument();

    await user.click(tileFor("Weak"));

    expect(screen.queryByText("Weak Site")).not.toBeInTheDocument();
    expect(screen.getByText(/pick a category above/i)).toBeInTheDocument();
  });

  it("returns to the overview from a category list via the healthy KPI tile", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
      entryIn(group, { title: "Strong Site", password: new Password(STRONG_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(tileFor("Healthy")).toHaveAttribute("aria-pressed", "true");

    await user.click(tileFor("Weak"));

    expect(screen.getByText("Weak Site")).toBeInTheDocument();
    expect(tileFor("Healthy")).toHaveAttribute("aria-pressed", "false");

    await user.click(tileFor("Healthy"));

    expect(screen.queryByText("Weak Site")).not.toBeInTheDocument();
    expect(overviewRowFor("Weak passwords")).toHaveTextContent("50%");
    expect(tileFor("Healthy")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a message when the selected category has no entries", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    await user.click(tileFor("Strong"));

    expect(screen.getByText(/no entries in this category/i)).toBeInTheDocument();
  });

  it("shows the entry's username instead of the group name when it has one", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, {
        title: "Weak Site",
        username: "alex.rivera@gmail.com",
        password: new Password(WEAK_PASSWORD),
      }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);
    await user.click(tileFor("Weak"));

    expect(screen.getByText("alex.rivera@gmail.com")).toBeInTheDocument();
    expect(screen.queryByText("Personal")).not.toBeInTheDocument();
  });

  it("shows a placeholder for a flagged entry with no title", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [entryIn(group, { password: new Password(WEAK_PASSWORD) })];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);
    await user.click(tileFor("Weak"));

    expect(screen.getByText("(untitled)")).toBeInTheDocument();
  });

  it("calls onSelectEntry with the entry and its group when a listed entry is clicked", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entry = Entry.create({ title: "Weak Site", password: new Password(WEAK_PASSWORD) });
    const entries: EntryWithGroup[] = [{ entry, group }];
    const onSelectEntry = vi.fn();

    render(<HealthScreen entries={entries} onSelectEntry={onSelectEntry} />);
    await user.click(tileFor("Weak"));
    await user.click(screen.getByText("Weak Site"));

    expect(onSelectEntry).toHaveBeenCalledWith(entry, group);
  });

  describe("expired entries", () => {
    const PAST = new Date(Date.now() - 86_400_000);
    const FUTURE = new Date(Date.now() + 86_400_000);

    it("counts expired entries in their own category, whatever their password", () => {
      const group = Group.create("Personal");
      const entries: EntryWithGroup[] = [
        entryIn(group, {
          title: "Old Strong",
          password: new Password(STRONG_PASSWORD),
          expiresAt: PAST,
        }),
        entryIn(group, {
          title: "Still Valid",
          password: new Password(OTHER_STRONG_PASSWORD),
          expiresAt: FUTURE,
        }),
      ];

      render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

      expect(tileFor("Expired")).toHaveTextContent("1");
      expect(tileFor("Strong")).toHaveTextContent("2");
      // A strong password on an expired entry still needs attention.
      expect(screen.getByText(/1 of 2 passwords are healthy/i)).toBeInTheDocument();
      expect(overviewRowFor("Expired entries")).toHaveTextContent("50%");
    });

    it("lists expired entries, linked ones included, and opens one when picked", async () => {
      const user = userEvent.setup();
      const onSelectEntry = vi.fn();
      const group = Group.create("Personal");
      const target = entryIn(group, { title: "Main", password: new Password(STRONG_PASSWORD) });
      const reference = target.entry.id.toString().replace(/-/g, "");
      const linked = entryIn(group, {
        title: "Linked",
        password: new Password(`{REF:P@I:${reference}}`),
        expiresAt: PAST,
      });

      render(<HealthScreen entries={[target, linked]} onSelectEntry={onSelectEntry} />);
      await user.click(tileFor("Expired"));
      await user.click(screen.getByRole("button", { name: /Linked/ }));

      expect(onSelectEntry).toHaveBeenCalledWith(linked.entry, group);
    });
  });
});
