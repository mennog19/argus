import { useState } from "react";
import { CustomField, CustomFields } from "../../domain";
import { TrashIcon } from "../icons";

interface CustomFieldsEditorProps {
  fields: CustomFields;
  onChange: (fields: CustomFields) => void;
}

interface DraftRow {
  id: string;
  key: string;
  value: string;
}

function toDraftRows(fields: CustomFields): DraftRow[] {
  return fields.values.map((field) => ({ id: field.key, key: field.key, value: field.value }));
}

function toCustomFields(rows: readonly DraftRow[]): CustomFields {
  return new CustomFields(
    rows.filter((row) => row.key.trim() !== "").map((row) => new CustomField(row.key, row.value)),
  );
}

export function CustomFieldsEditor({ fields, onChange }: CustomFieldsEditorProps) {
  const [rows, setRows] = useState<DraftRow[]>(() => toDraftRows(fields));

  function updateRows(next: DraftRow[]) {
    setRows(next);
    onChange(toCustomFields(next));
  }

  function addRow() {
    setRows([...rows, { id: crypto.randomUUID(), key: "", value: "" }]);
  }

  function updateRow(id: string, patch: Partial<Pick<DraftRow, "key" | "value">>) {
    updateRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    updateRows(rows.filter((row) => row.id !== id));
  }

  return (
    <div className="custom-fields-editor">
      {rows.map((row) => (
        <div key={row.id} className="custom-field-row">
          <input
            type="text"
            className="field-input"
            value={row.key}
            onChange={(event) => updateRow(row.id, { key: event.target.value })}
            placeholder="Field name"
            aria-label="Custom field name"
          />
          <input
            type="text"
            className="field-input"
            value={row.value}
            onChange={(event) => updateRow(row.id, { value: event.target.value })}
            placeholder="Value"
            aria-label="Custom field value"
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove field ${row.key || "unnamed"}`}
            onClick={() => removeRow(row.id)}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={addRow}>
        Add custom field
      </button>
    </div>
  );
}
