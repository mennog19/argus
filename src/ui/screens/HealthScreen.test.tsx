import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, Group, Password } from "../../domain";
import { EntryWithGroup } from "../vault-browsing";
import { HealthScreen } from "./HealthScreen";

const STRONG_PASSWORD = "Correct-Horse-7!";
const FAIR_PASSWORD = "Correct-Horse7";
const WEAK_PASSWORD = "abc";

function entryIn(group: Group, fields: Parameters<typeof Entry.create>[0] = {}): EntryWithGroup {
  return { entry: Entry.create(fields), group };
}

function tileFor(label: string) {
  return screen.getByText(label).closest("button") as HTMLButtonElement;
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
    expect(tileFor("Reused")).toHaveTextContent("0");
    expect(tileFor("Weak")).toHaveTextContent("1");
    expect(tileFor("Fair")).toHaveTextContent("1");
    expect(tileFor("Strong")).toHaveTextContent("1");
  });

  it("auto-selects the highest-priority non-empty category, listing its entries", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
      entryIn(group, { title: "Fair Site", password: new Password(FAIR_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(screen.getByText("Weak passwords")).toBeInTheDocument();
    expect(screen.getByText("Weak Site")).toBeInTheDocument();
    expect(screen.queryByText("Fair Site")).not.toBeInTheDocument();
  });

  it("lists reused passwords grouped together and takes priority over weak", () => {
    const group = Group.create("Personal");
    const shared = WEAK_PASSWORD;
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "GitHub", password: new Password(shared) }),
      entryIn(group, { title: "GitLab", password: new Password(shared) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(tileFor("Reused")).toHaveTextContent("2");
    expect(tileFor("Weak")).toHaveTextContent("0");
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

    expect(screen.getByText("Weak Site")).toBeInTheDocument();

    await user.click(tileFor("Strong"));

    expect(screen.getByText("Strong passwords")).toBeInTheDocument();
    expect(screen.getByText("Strong Site")).toBeInTheDocument();
    expect(screen.queryByText("Weak Site")).not.toBeInTheDocument();
  });

  it("hides the list when clicking the already-selected tile", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Weak Site", password: new Password(WEAK_PASSWORD) }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(screen.getByText("Weak passwords")).toBeInTheDocument();

    await user.click(tileFor("Weak"));

    expect(screen.queryByText("Weak passwords")).not.toBeInTheDocument();
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

  it("shows the entry's username instead of the group name when it has one", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, {
        title: "Weak Site",
        username: "alex.rivera@gmail.com",
        password: new Password(WEAK_PASSWORD),
      }),
    ];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(screen.getByText("alex.rivera@gmail.com")).toBeInTheDocument();
    expect(screen.queryByText("Personal")).not.toBeInTheDocument();
  });

  it("shows a placeholder for a flagged entry with no title", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [entryIn(group, { password: new Password(WEAK_PASSWORD) })];

    render(<HealthScreen entries={entries} onSelectEntry={vi.fn()} />);

    expect(screen.getByText("(untitled)")).toBeInTheDocument();
  });

  it("calls onSelectEntry with the entry and its group when a listed entry is clicked", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entry = Entry.create({ title: "Weak Site", password: new Password(WEAK_PASSWORD) });
    const entries: EntryWithGroup[] = [{ entry, group }];
    const onSelectEntry = vi.fn();

    render(<HealthScreen entries={entries} onSelectEntry={onSelectEntry} />);
    await user.click(screen.getByText("Weak Site"));

    expect(onSelectEntry).toHaveBeenCalledWith(entry, group);
  });
});
