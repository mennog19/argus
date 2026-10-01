import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Attachment, Attachments, MAX_ATTACHMENT_BYTES } from "../../../../src/domain";
import { EntryAttachments } from "../../../../src/ui/screens/vault-shell/EntryAttachments";

const notes = new Attachment("notes.txt", new Uint8Array(2048));
const photo = new Attachment("photo.png", new Uint8Array([1, 2, 3]));

function renderAttachments(
  attachments: Attachments,
  overrides: {
    onAdd?: (added: readonly Attachment[]) => Promise<void>;
    onRename?: (name: string, newName: string) => Promise<void>;
    onRemove?: (name: string) => Promise<void>;
    onExport?: (attachment: Attachment) => Promise<string | undefined>;
  } = {},
) {
  const handlers = {
    onAdd: overrides.onAdd ?? vi.fn().mockResolvedValue(undefined),
    onRename: overrides.onRename ?? vi.fn().mockResolvedValue(undefined),
    onRemove: overrides.onRemove ?? vi.fn().mockResolvedValue(undefined),
    onExport: overrides.onExport ?? vi.fn().mockResolvedValue(undefined),
  };
  render(<EntryAttachments attachments={attachments} {...handlers} />);
  return handlers;
}

/** A file that reports `size` bytes without the test having to allocate them. */
function fileOfSize(name: string, size: number): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("EntryAttachments", () => {
  it("offers to add a file to an entry that has none", () => {
    renderAttachments(Attachments.EMPTY);

    expect(screen.getByText("Attachments")).toBeInTheDocument();
    expect(screen.getByLabelText("Add attachment")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("lists each file with its size", () => {
    renderAttachments(new Attachments([notes, photo]));

    expect(screen.getByText("Attachments (2)")).toBeInTheDocument();
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["notes.txt2 KB", "photo.png3 B"]);
  });

  describe("adding", () => {
    it("hands over the picked files with their names and bytes", async () => {
      const user = userEvent.setup();
      const { onAdd } = renderAttachments(Attachments.EMPTY);

      await user.upload(screen.getByLabelText("Add attachment"), [
        new File(["hello"], "greeting.txt"),
        new File([new Uint8Array([7, 8])], "data.bin"),
      ]);

      expect(onAdd).toHaveBeenCalledTimes(1);
      const added: readonly Attachment[] = vi.mocked(onAdd).mock.calls[0][0];
      expect(added.map((attachment) => attachment.name)).toEqual(["greeting.txt", "data.bin"]);
      expect(new TextDecoder().decode(added[0].data)).toBe("hello");
      expect(added[1].data).toEqual(new Uint8Array([7, 8]));
    });

    it("lets the same file be picked twice in a row", async () => {
      const user = userEvent.setup();
      const { onAdd } = renderAttachments(Attachments.EMPTY);
      const input = screen.getByLabelText<HTMLInputElement>("Add attachment");

      await user.upload(input, new File(["hello"], "greeting.txt"));

      expect(input.value).toBe("");
      await user.upload(input, new File(["hello"], "greeting.txt"));
      expect(onAdd).toHaveBeenCalledTimes(2);
    });

    it("does nothing when the file dialog is dismissed", () => {
      const { onAdd } = renderAttachments(Attachments.EMPTY);

      fireEvent.change(screen.getByLabelText("Add attachment"), { target: { files: [] } });
      fireEvent.change(screen.getByLabelText("Add attachment"), { target: { files: null } });

      expect(onAdd).not.toHaveBeenCalled();
    });

    it("refuses a file over the size limit, without attaching the others", async () => {
      const user = userEvent.setup();
      const { onAdd } = renderAttachments(Attachments.EMPTY);

      await user.upload(screen.getByLabelText("Add attachment"), [
        new File(["fine"], "small.txt"),
        fileOfSize("huge.iso", MAX_ATTACHMENT_BYTES + 1),
      ]);

      expect(
        await screen.findByText('"huge.iso" is too large. Attachments can be up to 10.0 MB.'),
      ).toBeInTheDocument();
      expect(onAdd).not.toHaveBeenCalled();
    });

    it("accepts a file exactly at the size limit", async () => {
      const user = userEvent.setup();
      const { onAdd } = renderAttachments(Attachments.EMPTY);

      await user.upload(
        screen.getByLabelText("Add attachment"),
        fileOfSize("limit.bin", MAX_ATTACHMENT_BYTES),
      );

      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it("refuses an empty file", async () => {
      const user = userEvent.setup();
      const { onAdd } = renderAttachments(Attachments.EMPTY);

      await user.upload(screen.getByLabelText("Add attachment"), new File([], "empty.txt"));

      expect(
        await screen.findByText('"empty.txt" is empty, so there\'s nothing to attach.'),
      ).toBeInTheDocument();
      expect(onAdd).not.toHaveBeenCalled();
    });

    it("shows why saving failed", async () => {
      const user = userEvent.setup();
      renderAttachments(Attachments.EMPTY, {
        onAdd: vi.fn().mockRejectedValue(new Error("disk full")),
      });

      await user.upload(screen.getByLabelText("Add attachment"), new File(["x"], "a.txt"));

      expect(await screen.findByText("disk full")).toBeInTheDocument();
    });

    it("falls back to a general message when the failure has none", async () => {
      const user = userEvent.setup();
      renderAttachments(Attachments.EMPTY, { onAdd: vi.fn().mockRejectedValue(undefined) });

      await user.upload(screen.getByLabelText("Add attachment"), new File(["x"], "a.txt"));

      expect(await screen.findByText("Couldn't attach that file.")).toBeInTheDocument();
    });
  });

  describe("saving a copy", () => {
    it("exports the file and says where the unencrypted copy went", async () => {
      const user = userEvent.setup();
      const onExport = vi.fn().mockResolvedValue("C:/out/notes.txt");
      renderAttachments(new Attachments([notes, photo]), { onExport });

      await user.click(screen.getByRole("button", { name: "Save a copy of notes.txt" }));

      expect(onExport).toHaveBeenCalledWith(notes);
      expect(
        await screen.findByText("Saved a copy to C:/out/notes.txt. It isn't encrypted there."),
      ).toBeInTheDocument();
    });

    it("says nothing when the save dialog is cancelled", async () => {
      const user = userEvent.setup();
      const onExport = vi.fn().mockResolvedValue(undefined);
      renderAttachments(new Attachments([notes]), { onExport });

      await user.click(screen.getByRole("button", { name: "Save a copy of notes.txt" }));

      expect(onExport).toHaveBeenCalled();
      expect(screen.queryByText(/Saved a copy/)).not.toBeInTheDocument();
    });

    it("shows a failure, and clears the last save's message", async () => {
      const user = userEvent.setup();
      const onExport = vi
        .fn()
        .mockResolvedValueOnce("C:/out/notes.txt")
        .mockRejectedValueOnce("forbidden path")
        .mockRejectedValueOnce(undefined);
      renderAttachments(new Attachments([notes]), { onExport });
      const save = screen.getByRole("button", { name: "Save a copy of notes.txt" });

      await user.click(save);
      expect(await screen.findByText(/Saved a copy/)).toBeInTheDocument();

      await user.click(save);
      expect(await screen.findByText("forbidden path")).toBeInTheDocument();
      expect(screen.queryByText(/Saved a copy/)).not.toBeInTheDocument();

      await user.click(save);
      expect(await screen.findByText("Couldn't save a copy of that file.")).toBeInTheDocument();
    });
  });

  describe("renaming", () => {
    it("renames a file to the trimmed name typed, then shows the row again", async () => {
      const user = userEvent.setup();
      const { onRename } = renderAttachments(new Attachments([notes, photo]));

      await user.click(screen.getByRole("button", { name: "Rename notes.txt" }));
      const input = screen.getByLabelText("New name for notes.txt");
      expect(input).toHaveValue("notes.txt");
      expect(input).toHaveFocus();
      await user.clear(input);
      await user.type(input, "  todo.txt {Enter}");

      expect(onRename).toHaveBeenCalledWith("notes.txt", "todo.txt");
      expect(screen.queryByLabelText("New name for notes.txt")).not.toBeInTheDocument();
    });

    it("keeps the other rows usable while one is being renamed", async () => {
      const user = userEvent.setup();
      renderAttachments(new Attachments([notes, photo]));

      await user.click(screen.getByRole("button", { name: "Rename notes.txt" }));

      expect(screen.getByRole("button", { name: "Rename photo.png" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Rename notes.txt" })).not.toBeInTheDocument();
    });

    it("cancels without renaming", async () => {
      const user = userEvent.setup();
      const { onRename } = renderAttachments(new Attachments([notes]));

      await user.click(screen.getByRole("button", { name: "Rename notes.txt" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Rename notes.txt" })).toBeInTheDocument();
    });

    it("stays open and shows why when the name is refused", async () => {
      const user = userEvent.setup();
      const onRename = vi.fn(() => {
        throw new Error('There\'s already an attachment named "photo.png".');
      });
      renderAttachments(new Attachments([notes, photo]), { onRename });

      await user.click(screen.getByRole("button", { name: "Rename notes.txt" }));
      await user.clear(screen.getByLabelText("New name for notes.txt"));
      await user.type(screen.getByLabelText("New name for notes.txt"), "photo.png");
      await user.click(screen.getByRole("button", { name: "Rename" }));

      expect(
        await screen.findByText('There\'s already an attachment named "photo.png".'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("New name for notes.txt")).toHaveValue("photo.png");
    });

    it("falls back to a general message when the failure has none", async () => {
      const user = userEvent.setup();
      renderAttachments(new Attachments([notes]), {
        onRename: vi.fn().mockRejectedValue(undefined),
      });

      await user.click(screen.getByRole("button", { name: "Rename notes.txt" }));
      await user.click(screen.getByRole("button", { name: "Rename" }));

      expect(await screen.findByText("Couldn't rename that file.")).toBeInTheDocument();
    });
  });

  describe("deleting", () => {
    it("asks first, warning that history keeps a copy, then deletes", async () => {
      const user = userEvent.setup();
      const { onRemove } = renderAttachments(new Attachments([notes, photo]));

      await user.click(screen.getByRole("button", { name: "Delete notes.txt" }));

      expect(
        screen.getByText("Delete notes.txt? Versions in this entry's history keep their copy."),
      ).toBeInTheDocument();
      expect(onRemove).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(onRemove).toHaveBeenCalledWith("notes.txt");
      expect(screen.queryByText(/Delete notes.txt\?/)).not.toBeInTheDocument();
    });

    it("cancels without deleting", async () => {
      const user = userEvent.setup();
      const { onRemove } = renderAttachments(new Attachments([notes]));

      await user.click(screen.getByRole("button", { name: "Delete notes.txt" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onRemove).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Delete notes.txt" })).toBeInTheDocument();
    });

    it("keeps asking and shows why when the delete fails", async () => {
      const user = userEvent.setup();
      renderAttachments(new Attachments([notes]), {
        onRemove: vi.fn().mockRejectedValue(undefined),
      });

      await user.click(screen.getByRole("button", { name: "Delete notes.txt" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("Couldn't delete that file.")).toBeInTheDocument();
      expect(screen.getByText(/Delete notes.txt\?/)).toBeInTheDocument();
    });

    it("clears an earlier error when another action starts", async () => {
      const user = userEvent.setup();
      renderAttachments(new Attachments([notes]), {
        onRemove: vi.fn().mockRejectedValue(new Error("save failed")),
      });

      await user.click(screen.getByRole("button", { name: "Delete notes.txt" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(await screen.findByText("save failed")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("save failed")).not.toBeInTheDocument();
    });
  });

  it("disables every control while a change is being saved", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onRemove = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderAttachments(new Attachments([notes, photo]), { onRemove });

    await user.click(screen.getByRole("button", { name: "Delete notes.txt" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rename photo.png" })).toBeDisabled();
    expect(screen.getByLabelText("Add attachment")).toBeDisabled();

    finish();
    expect(await screen.findByRole("button", { name: "Delete notes.txt" })).toBeEnabled();
  });
});
