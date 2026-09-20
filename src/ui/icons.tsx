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

export function SearchIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke={color} strokeWidth="2" />
      <path d="M20 20l-4.5-4.5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
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

export function VaultIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="none" stroke={color} strokeWidth="2" />
      <path d="M12 9v1.2M12 14.8V16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function GeneratorIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke={color} strokeWidth="2" />
      <circle cx="9" cy="9" r="1.2" fill={color} />
      <circle cx="15" cy="9" r="1.2" fill={color} />
      <circle cx="9" cy="15" r="1.2" fill={color} />
      <circle cx="15" cy="15" r="1.2" fill={color} />
      <circle cx="12" cy="12" r="1.2" fill={color} />
    </svg>
  );
}

export function HealthIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20s-7-4.35-9.5-9C.9 7.4 3 4 6.2 4 8.4 4 10 5.2 12 7c2-1.8 3.6-3 5.8-3C21 4 23.1 7.4 21.5 11 19 15.65 12 20 12 20Z"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M5 12h3l1.5-3L12 15l1.5-3H19"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RefreshIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M17 4v4h-4M7 20v-4h4" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
