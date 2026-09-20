interface IconProps {
  size?: number;
  color?: string;
}

export function LockIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="11" width="12" height="9" rx="2" fill="none" stroke={color} strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function PlusIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function EditIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 20h4L18.5 9.5a2.5 2.5 0 0 0-4-4L4 16v4Z"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function XIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronIcon({ size = 12, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
