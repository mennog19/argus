import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomField, CustomFields, Entry, Icon, GroupId, Password, Tag, Tags } from "../../domain";
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
    expect(screen.queryByText("Custom fields")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry] = onSubmit.mock.calls[0];
    expect(entry.id.equals(existing.id)).toBe(true);
    expect(entry.password.reveal()).toBe("old-pass");
    expect(entry.customFields).toEqual(new CustomFields([new CustomField("PIN", "1234")]));
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

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
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

  it("does not include an authenticator field when none is entered", async () => {
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
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry] = onSubmit.mock.calls[0];
    expect(entry.customFields.values).toHaveLength(0);
  });

  it("stores a bare TOTP secret as an otpauth otp custom field", async () => {
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
    await user.type(screen.getByLabelText("Authenticator (TOTP)"), "JBSWY3DPEHPK3PXP");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry] = onSubmit.mock.calls[0];
    const otpField = entry.customFields.get("otp");
    expect(otpField).toBeDefined();
    expect(otpField.isProtected).toBe(true);
    expect(otpField.value).toMatch(/^otpauth:\/\/totp\/GitHub\?/);
    expect(otpField.value).toContain("secret=JBSWY3DPEHPK3PXP");
  });

  it("stores a pasted otpauth URI as-is", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const uri = "otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP&digits=8&period=60";

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
    await user.type(screen.getByLabelText("Authenticator (TOTP)"), uri);
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry] = onSubmit.mock.calls[0];
    expect(entry.customFields.get("otp").value).toBe(uri);
  });

  it("shows an error and does not submit for an invalid TOTP value", async () => {
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
    await user.type(screen.getByLabelText("Title"), "GitHub");
    await user.type(screen.getByLabelText("Authenticator (TOTP)"), "not-a-valid-secret!!!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Invalid TOTP secret or otpauth:// URI.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("toggles authenticator secret reveal", async () => {
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

    expect(screen.getByLabelText("Authenticator (TOTP)")).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show authenticator secret" }));
    expect(screen.getByLabelText("Authenticator (TOTP)")).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide authenticator secret" }));
    expect(screen.getByLabelText("Authenticator (TOTP)")).toHaveAttribute("type", "password");
  });

  it("prefills the authenticator field from an existing otp custom field", () => {
    const existing = Entry.create({
      title: "GitHub",
      customFields: new CustomFields([
        new CustomField("otp", "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP", true),
      ]),
    });

    render(
      <EntryForm
        initialEntry={existing}
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Authenticator (TOTP)")).toHaveValue(
      "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP",
    );
  });

  it("leaves an untouched otp field byte-for-byte unchanged on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const rawOtp = "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP&issuer=GitHub";
    const existing = Entry.create({
      title: "GitHub",
      customFields: new CustomFields([new CustomField("otp", rawOtp, true)]),
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
    await user.clear(screen.getByLabelText("Username"));
    await user.type(screen.getByLabelText("Username"), "octocat");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry] = onSubmit.mock.calls[0];
    expect(entry.customFields.get("otp").value).toBe(rawOtp);
  });

  it("prefills the authenticator field from the classic TOTP Seed/Settings fields", () => {
    const existing = Entry.create({
      title: "Legacy",
      customFields: new CustomFields([
        new CustomField("TOTP Seed", "JBSWY3DPEHPK3PXP", true),
        new CustomField("TOTP Settings", "60;8"),
      ]),
    });

    render(
      <EntryForm
        initialEntry={existing}
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Authenticator (TOTP)")).toHaveValue(
      "otpauth://totp/Legacy?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=8&period=60",
    );
  });

  it("replaces classic TOTP Seed/Settings fields with the modern otp field when re-saved", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const existing = Entry.create({
      title: "Legacy",
      customFields: new CustomFields([
        new CustomField("TOTP Seed", "JBSWY3DPEHPK3PXP", true),
        new CustomField("TOTP Settings", "60;8"),
      ]),
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
    await user.clear(screen.getByLabelText("Authenticator (TOTP)"));
    await user.type(screen.getByLabelText("Authenticator (TOTP)"), "JBSWY3DPEHPK3PXP");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry] = onSubmit.mock.calls[0];
    expect(entry.customFields.get("TOTP Seed")).toBeUndefined();
    expect(entry.customFields.get("TOTP Settings")).toBeUndefined();
    expect(entry.customFields.get("otp")).toBeDefined();
  });

  it("removes the TOTP fields when the authenticator input is cleared", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const existing = Entry.create({
      title: "GitHub",
      customFields: new CustomFields([
        new CustomField("otp", "otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP", true),
      ]),
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
    await user.clear(screen.getByLabelText("Authenticator (TOTP)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [entry] = onSubmit.mock.calls[0];
    expect(entry.customFields.get("otp")).toBeUndefined();
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

    expect(await screen.findByText("forbidden path: C:/vaults/mine.kdbx.bak1")).toBeInTheDocument();
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

  it("saves the chosen icon, and keeps an existing entry's icon when untouched", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const existing = Entry.create({ title: "Trip", icon: Icon.library("plane") });

    const { unmount } = render(
      <EntryForm
        initialEntry={existing}
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit.mock.calls[0][0].icon.toString()).toBe("library:plane");
    unmount();

    render(
      <EntryForm
        initialGroupId="root-id"
        groupOptions={groupOptions}
        generatorPolicy={{}}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Title"), "Holiday");
    await user.click(screen.getByRole("button", { name: "Change icon" }));
    await user.click(screen.getByRole("button", { name: "Luggage" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit.mock.calls[1][0].icon.toString()).toBe("library:luggage");
  });
});
