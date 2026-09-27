import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tag, Tags } from "../../../src/domain";
import { TagsEditor } from "../../../src/ui/screens/TagsEditor";

describe("TagsEditor", () => {
  it("renders no chips when there are no tags", () => {
    render(<TagsEditor tags={new Tags()} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /remove tag/i })).not.toBeInTheDocument();
  });

  it("renders a chip per tag with a remove button", () => {
    const tags = new Tags([new Tag("work"), new Tag("email")]);

    render(<TagsEditor tags={tags} onChange={vi.fn()} />);

    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
  });

  it("adds a trimmed tag via the Add button and clears the input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TagsEditor tags={new Tags()} onChange={onChange} />);

    await user.type(screen.getByLabelText("Add a tag"), "  work  ");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(new Tags([new Tag("work")]));
    expect(screen.getByLabelText("Add a tag")).toHaveValue("");
  });

  it("adds a tag when pressing Enter in the input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TagsEditor tags={new Tags()} onChange={onChange} />);

    await user.type(screen.getByLabelText("Add a tag"), "work{Enter}");

    expect(onChange).toHaveBeenCalledWith(new Tags([new Tag("work")]));
  });

  it("does not add an empty or whitespace-only tag", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TagsEditor tags={new Tags()} onChange={onChange} />);

    await user.type(screen.getByLabelText("Add a tag"), "   {Enter}");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a tag when its chip's remove button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const tags = new Tags([new Tag("work"), new Tag("email")]);

    render(<TagsEditor tags={tags} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remove tag work" }));

    expect(onChange).toHaveBeenCalledWith(new Tags([new Tag("email")]));
  });
});
