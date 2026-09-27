import { CheckIcon } from "../../icons";

export interface MergeStepLabel {
  label: string;
  /** Shown as a badge; omitted for steps that aren't a list of entries. */
  count?: number;
}

interface MergeStepperProps {
  steps: readonly MergeStepLabel[];
  current: number;
  onSelect: (index: number) => void;
}

export function MergeStepper({ steps, current, onSelect }: MergeStepperProps) {
  return (
    <ol className="merge-steps">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={`merge-step${index === current ? " current" : ""}${
            index < current ? " done" : ""
          }`}
        >
          <button
            type="button"
            className="merge-step-button"
            aria-current={index === current ? "step" : undefined}
            onClick={() => onSelect(index)}
          >
            <span className="merge-step-node">
              {index < current ? <CheckIcon size={13} /> : index + 1}
            </span>
            <span className="merge-step-text">
              <span className="merge-step-label">{step.label}</span>
              {step.count !== undefined && <span className="merge-step-count">{step.count}</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
