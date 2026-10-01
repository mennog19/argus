import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_ENTRY_FIELD_VISIBILITY } from "../../../src/application/settings";
import { EntryForm } from "../../../src/ui/screens/EntryForm";

function renderForm(onSubmit: () => Promise<void>) {
  render(
    <EntryForm
      initialGroupId="root-id"
      groupOptions={[{ id: "root-id", label: "My Vault" }]}
      generatorPolicy={{}}
      fieldVisibility={DEFAULT_ENTRY_FIELD_VISIBILITY}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
}

describe("EntryForm save shortcut", () => {
  it("saves with Ctrl+S from inside a field, without the form being told its bindings", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);

    await userEvent.type(screen.getByLabelText("Title"), "Bank{Control>}s{/Control}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].title).toBe("Bank");
  });

  it("checks the form the way the Save button does", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);

    await userEvent.keyboard("{Control>}s{/Control}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
  });

  it("doesn't save a second time while the first save is still going", async () => {
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>(() => {}));
    renderForm(onSubmit);
    await userEvent.type(screen.getByLabelText("Title"), "Bank");

    await userEvent.keyboard("{Control>}s{/Control}");
    fireEvent.keyDown(document, { code: "KeyS", ctrlKey: true });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
