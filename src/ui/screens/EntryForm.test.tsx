import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomField, CustomFields, Entry, GroupId, Password, Tag, Tags } from "../../domain";
import { EntryForm } from "./EntryForm";

const groupOptions = [
  { id: "root-id", label: "My Vault" },
  { id: "work-id", label: "  Work" },
];

describe("EntryForm", () => {
  it("submits a newly created entry with the form's field values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <EntryForm
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.type(screen.getByLabelText("Username"), "octocat");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.type(screen.getByLabelText("URL"), "https://github.com");
    await user.type(screen.getByLabelText("Notes"), "some notes");
    await user.selectOptions(screen.getByLabelText("Group"), "work-id");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [entry, groupId] = onSubmit.mock.calls[0];
    expect(entry.title).toBe("GitHub");
    expect(entry.username).toBe("octocat");
    expect(entry.password.reveal()).toBe("hunter2");
    expect(entry.url).toBe("https://github.com");
    expect(entry.notes).toBe("some notes");
    expect(groupId).toEqual(GroupId.fromString("work-id"));
  });

  it("prefills from an existing entry in edit mode and preserves its id on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const existing = Entry.create({
      title: "GitHub",
      username: "octocat",
      password: new Password("old-pass"),
      tags: new Tags([new Tag("work")]),
      customFields: new CustomFields([new CustomField("PIN", "1234")]),
    });

    render(
      <EntryForm
        initialEntry={existing}
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveValue("GitHub");
    expect(screen.getByLabelText("Username")).toHaveValue("octocat");
    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByDisplayValue("PIN")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry] = onSubmit.mock.calls[0];
    expect(entry.id.equals(existing.id)).toBe(true);
    expect(entry.password.reveal()).toBe("old-pass");
  });

  it("toggles password reveal", async () => {
    const user = userEvent.setup();

    render(
      <EntryForm
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("generates a password using the shared generator policy and reveals it", async () => {
    const user = userEvent.setup();

    render(
      <EntryForm
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{ length: 12, useSymbols: false }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Password")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toHaveLength(12);
  });

  it("shows an error and does not submit when the title is blank", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <EntryForm
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the error message and keeps the entered values when onSubmit rejects", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("Disk full"));

    render(
      <EntryForm
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Disk full")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("GitHub");
  });

  it("shows a generic error message when onSubmit rejects with a non-Error value", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue("forbidden path: C:/vaults/mine.kdbx.bak1");

    render(
      <EntryForm
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("forbidden path: C:/vaults/mine.kdbx.bak1"),
    ).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <EntryForm
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
