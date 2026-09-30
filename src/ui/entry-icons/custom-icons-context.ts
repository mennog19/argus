import { createContext, useContext } from "react";
import { CustomIcons } from "../../domain";

/**
 * Managing the vault's custom icons. There's no `add`: an upload is saved
 * together with the entry or group edit that uses it.
 */
export interface CustomIconEditor {
  /** Deletes the icon from the vault, saving straight away. */
  remove(id: string): Promise<void>;
  /** How many entries and groups show the icon, for the delete warning. */
  usage(id: string): number;
}

export interface CustomIconLibrary {
  icons: CustomIcons;
  /** Absent where the icons are only shown, not managed (e.g. a merge preview). */
  editor?: CustomIconEditor;
}

/**
 * The open vault's custom icons. Every avatar needs them to draw an image
 * icon, and they live on the vault rather than the entry, so they're handed
 * down once here instead of through every list, panel and dialog.
 */
export const CustomIconsContext = createContext<CustomIconLibrary>({ icons: CustomIcons.EMPTY });

export function useCustomIcons(): CustomIconLibrary {
  return useContext(CustomIconsContext);
}
