import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Entry, Group, Password } from "../../domain";
import { EntryWithGroup } from "../vault-browsing";
import { HealthScreen } from "./HealthScreen";

const STRONG_PASSWORD = "Correct-Horse-7!";

function entryIn(group: Group, fields: Parameters<typeof Entry.create>[0] = {}): EntryWithGroup {
  return { entry: Entry.create(fields), group };
}

describe("HealthScreen", () => {
  it("shows a clean message when there are no health issues", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [entryIn(group, { title: "GitHub", password: new Password(STRONG_PASSWORD) })];

    render(
      <HealthScreen entries={entries} passwordChangedTimes={new Map()} onSelectEntry={vi.fn()} />,
    );

    expect(screen.getByText(/no password health issues found/i)).toBeInTheDocument();
  });

  it("lists reused passwords grouped together", () => {
    const group = Group.create("Personal");
    const shared = "shared-password-1";
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "GitHub", password: new Password(shared) }),
      entryIn(group, { title: "GitLab", password: new Password(shared) }),
    ];

    render(
      <HealthScreen entries={entries} passwordChangedTimes={new Map()} onSelectEntry={vi.fn()} />,
    );

    expect(screen.getByText(/reused passwords/i)).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("GitLab")).toBeInTheDocument();
    expect(screen.queryByText(/no password health issues found/i)).not.toBeInTheDocument();
  });

  it("lists weak passwords", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [entryIn(group, { title: "Weak Site", password: new Password("abc") })];

    render(
      <HealthScreen entries={entries} passwordChangedTimes={new Map()} onSelectEntry={vi.fn()} />,
    );

    expect(screen.getByText(/weak passwords/i)).toBeInTheDocument();
    expect(screen.getByText("Weak Site")).toBeInTheDocument();
  });

  it("lists stale passwords based on the provided changed-at times", () => {
    const group = Group.create("Personal");
    const entry = Entry.create({ title: "Old Site", password: new Password(STRONG_PASSWORD) });
    const entries: EntryWithGroup[] = [{ entry, group }];
    const changedTimes = new Map([[entry.id.toString(), new Date("2000-01-01T00:00:00.000Z")]]);

    render(<HealthScreen entries={entries} passwordChangedTimes={changedTimes} onSelectEntry={vi.fn()} />);

    expect(screen.getByText(/stale passwords/i)).toBeInTheDocument();
    expect(screen.getByText("Old Site")).toBeInTheDocument();
  });

  it("treats an entry missing from the changed-times map as just changed, not stale", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [
      entryIn(group, { title: "Fresh Site", password: new Password(STRONG_PASSWORD) }),
    ];

    render(
      <HealthScreen entries={entries} passwordChangedTimes={new Map()} onSelectEntry={vi.fn()} />,
    );

    expect(screen.queryByText(/stale passwords/i)).not.toBeInTheDocument();
  });

  it("shows a placeholder for a flagged entry with no title", () => {
    const group = Group.create("Personal");
    const entries: EntryWithGroup[] = [entryIn(group, { password: new Password("abc") })];

    render(
      <HealthScreen entries={entries} passwordChangedTimes={new Map()} onSelectEntry={vi.fn()} />,
    );

    expect(screen.getByText("(untitled)")).toBeInTheDocument();
  });

  it("calls onSelectEntry with the entry and its group when a flagged entry is clicked", async () => {
    const user = userEvent.setup();
    const group = Group.create("Personal");
    const entry = Entry.create({ title: "Weak Site", password: new Password("abc") });
    const entries: EntryWithGroup[] = [{ entry, group }];
    const onSelectEntry = vi.fn();

    render(<HealthScreen entries={entries} passwordChangedTimes={new Map()} onSelectEntry={onSelectEntry} />);
    await user.click(screen.getByText("Weak Site"));

    expect(onSelectEntry).toHaveBeenCalledWith(entry, group);
  });
});
