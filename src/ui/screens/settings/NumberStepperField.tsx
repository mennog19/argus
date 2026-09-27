import { ChevronIcon } from "../../icons";

interface NumberStepperFieldProps {
  id: string;
  label: string;
  /** `undefined` renders as an empty box. */
  value: number | undefined;
  /** Spoken names for the two stepper buttons, e.g. "Increase clipboard clear seconds". */
  increaseLabel: string;
  decreaseLabel: string;
  /** The raw text typed into the box; the caller decides what counts as valid. */
  onInput: (raw: string) => void;
  onStep: (direction: 1 | -1) => void;
}

export function NumberStepperField({
  id,
  label,
  value,
  increaseLabel,
  decreaseLabel,
  onInput,
  onStep,
}: NumberStepperFieldProps) {
  return (
    <div className="detail-field-row">
      <label className="detail-field-row-label" htmlFor={id}>
        {label}
      </label>
      <div className="field-input-with-stepper">
        <input
          id={id}
          type="number"
          min={1}
          className="field-input"
          value={value ?? ""}
          onChange={(event) => onInput(event.target.value)}
        />
        <div className="field-stepper">
          <button type="button" aria-label={increaseLabel} onClick={() => onStep(1)}>
            <ChevronIcon size={9} />
          </button>
          <button type="button" aria-label={decreaseLabel} onClick={() => onStep(-1)}>
            <ChevronIcon size={9} />
          </button>
        </div>
      </div>
    </div>
  );
}
