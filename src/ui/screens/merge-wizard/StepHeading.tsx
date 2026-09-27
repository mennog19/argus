import { ReactNode } from "react";

interface StepHeadingProps {
  heading: string;
  lead: string;
  count?: string;
  actions?: ReactNode;
}

export function StepHeading({ heading, lead, count, actions }: StepHeadingProps) {
  return (
    <div className="merge-step-heading">
      <div className="merge-step-heading-text">
        <h2>{heading}</h2>
        <p>{lead}</p>
      </div>
      <div className="merge-step-heading-aside">
        {count && <span className="merge-step-tally">{count}</span>}
        {actions && <div className="merge-step-actions">{actions}</div>}
      </div>
    </div>
  );
}
