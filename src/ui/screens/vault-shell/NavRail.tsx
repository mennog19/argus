import { ComponentType } from "react";
import { ArgusMark } from "../../ArgusMark";
import { GeneratorIcon, HealthIcon, LockIcon, SettingsIcon, VaultIcon } from "../../icons";

export type ShellView = "vault" | "generator" | "health" | "settings" | "merge";

type NavView = Exclude<ShellView, "merge">;

const NAV_ITEMS: ReadonlyArray<{ view: NavView; label: string; Icon: ComponentType }> = [
  { view: "vault", label: "Vault", Icon: VaultIcon },
  { view: "generator", label: "Password generator", Icon: GeneratorIcon },
  { view: "health", label: "Password health", Icon: HealthIcon },
  { view: "settings", label: "Settings", Icon: SettingsIcon },
];

/** The merge wizard is opened from settings, so settings stays highlighted while it's up. */
function isActive(item: NavView, current: ShellView): boolean {
  return item === current || (item === "settings" && current === "merge");
}

interface NavRailProps {
  view: ShellView;
  onNavigate: (view: NavView) => void;
  onLock: () => void;
}

export function NavRail({ view, onNavigate, onLock }: NavRailProps) {
  return (
    <nav className="nav-rail">
      <div className="nav-logo">
        <ArgusMark />
      </div>
      <div className="nav-rail-icons">
        {NAV_ITEMS.map(({ view: item, label, Icon }) => (
          <button
            key={item}
            type="button"
            className={`icon-button${isActive(item, view) ? " active" : ""}`}
            aria-label={label}
            onClick={() => onNavigate(item)}
          >
            <Icon />
          </button>
        ))}
      </div>
      <button type="button" className="icon-button" onClick={onLock} aria-label="Lock vault">
        <LockIcon />
      </button>
    </nav>
  );
}
