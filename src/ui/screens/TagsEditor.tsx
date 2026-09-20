import { KeyboardEvent, useState } from "react";
import { Tag, Tags } from "../../domain";
import { XIcon } from "../icons";

interface TagsEditorProps {
  tags: Tags;
  onChange: (tags: Tags) => void;
}

export function TagsEditor({ tags, onChange }: TagsEditorProps) {
  const [draft, setDraft] = useState("");

  function addDraftTag() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      return;
    }
    onChange(tags.add(new Tag(trimmed)));
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraftTag();
    }
  }

  return (
    <div className="tags-editor">
      {tags.values.length > 0 && (
        <div className="tag-chips">
          {tags.values.map((tag) => (
            <span key={tag.toString()} className="tag-chip">
              {tag.toString()}
              <button
                type="button"
                aria-label={`Remove tag ${tag.toString()}`}
                onClick={() => onChange(tags.remove(tag))}
              >
                <XIcon size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="field-input-with-action">
        <input
          type="text"
          className="field-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag…"
          aria-label="Add a tag"
        />
        <button type="button" onClick={addDraftTag}>
          Add
        </button>
      </div>
    </div>
  );
}
