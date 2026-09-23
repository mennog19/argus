/**
 * DataTransfer type carrying a group id while it's dragged: to reorder among
 * its siblings (dropped on a row's top/bottom edge), or to be reparented
 * (dropped on the middle of another group's row).
 */
export const GROUP_DRAG_TYPE = "application/x-argus-group";
