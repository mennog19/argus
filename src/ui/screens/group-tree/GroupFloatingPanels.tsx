import { MouseEvent, RefObject } from "react";
import { CustomIcon, Group, Icon } from "../../../domain";
import { IconPicker } from "../../entry-icons/IconPicker";
import { EditIcon, PaletteIcon, TrashIcon } from "../../icons";
import { Anchor, floatingStyle, ICON_POPOVER_WIDTH, ROW_MENU_WIDTH } from "./floating-panel";

interface GroupRowMenuProps {
  anchor: Anchor;
  panelRef: RefObject<HTMLDivElement | null>;
  onChangeIcon: (event: MouseEvent<HTMLButtonElement>) => void;
  onRename: () => void;
  onDelete: () => void;
}

export function GroupRowMenu({
  anchor,
  panelRef,
  onChangeIcon,
  onRename,
  onDelete,
}: GroupRowMenuProps) {
  return (
    <div ref={panelRef} className="group-row-menu" style={floatingStyle(anchor, ROW_MENU_WIDTH)}>
      <button type="button" onClick={onChangeIcon}>
        <PaletteIcon size={14} />
        Change icon
      </button>
      <button type="button" onClick={onRename}>
        <EditIcon size={14} />
        Rename
      </button>
      <button type="button" className="danger" onClick={onDelete}>
        <TrashIcon size={14} />
        Delete
      </button>
    </div>
  );
}

interface GroupIconPopoverProps {
  group: Group;
  anchor: Anchor;
  panelRef: RefObject<HTMLDivElement | null>;
  error: string | undefined;
  onChange: (icon: Icon, added?: CustomIcon) => void;
}

export function GroupIconPopover({
  group,
  anchor,
  panelRef,
  error,
  onChange,
}: GroupIconPopoverProps) {
  return (
    <div
      ref={panelRef}
      className="group-icon-popover"
      style={floatingStyle(anchor, ICON_POPOVER_WIDTH)}
    >
      <IconPicker value={group.icon} title={group.name} url="" initiallyOpen onChange={onChange} />
      {error && <div className="group-composer-error">{error}</div>}
    </div>
  );
}
