import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomField, CustomFields } from "../../domain";
import { CustomFieldsEditor } from "./CustomFieldsEditor";

describe("CustomFieldsEditor", () => {
  it("renders no rows when there are no fields", () => {
    render(<CustomFieldsEditor fields={new CustomFields()} onChange={vi.fn()} />);

    expect(screen.queryByLabelText("Custom field name")).not.toBeInTheDocument();
  });

  it("renders a row per existing field, prefilled", () => {
    const fields = new CustomFields([new CustomField("PIN", "1234")]);

    render(<CustomFieldsEditor fields={fields} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Custom field name")).toHaveValue("PIN");
    expect(screen.getByLabelText("Custom field value")).toHaveValue("1234");
  });

  it("adds a new empty row when 'Add custom field' is clicked, without emitting a change yet", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<CustomFieldsEditor fields={new CustomFields()} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Add custom field" }));

    expect(screen.getByLabelText("Custom field name")).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits an updated CustomFields once a new row has a non-empty key", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<CustomFieldsEditor fields={new CustomFields()} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Add custom field" }));
    await user.type(screen.getByLabelText("Custom field name"), "PIN");
    await user.type(screen.getByLabelText("Custom field value"), "1234");

    expect(onChange).toHaveBeenLastCalledWith(new CustomFields([new CustomField("PIN", "1234")]));
  });

  it("omits rows with an empty key from the emitted CustomFields", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<CustomFieldsEditor fields={new CustomFields()} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Add custom field" }));
    await user.type(screen.getByLabelText("Custom field value"), "1234");

    expect(onChange).toHaveBeenLastCalledWith(new CustomFields());
  });

  it("edits one row's value without affecting the other rows", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = new CustomFields([new CustomField("PIN", "1234"), new CustomField("Note", "x")]);

    render(<CustomFieldsEditor fields={fields} onChange={onChange} />);

    const values = screen.getAllByLabelText("Custom field value");
    await user.type(values[1], "!");

    expect(onChange).toHaveBeenLastCalledWith(
      new CustomFields([new CustomField("PIN", "1234"), new CustomField("Note", "x!")]),
    );
  });

  it("removes a row and emits the updated CustomFields", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = new CustomFields([new CustomField("PIN", "1234"), new CustomField("Note", "x")]);

    render(<CustomFieldsEditor fields={fields} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remove field PIN" }));

    expect(onChange).toHaveBeenCalledWith(new CustomFields([new CustomField("Note", "x")]));
  });

  it("labels the remove button with 'unnamed' for a still-empty row", async () => {
    const user = userEvent.setup();

    render(<CustomFieldsEditor fields={new CustomFields()} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add custom field" }));

    expect(screen.getByRole("button", { name: "Remove field unnamed" })).toBeInTheDocument();
  });
});
