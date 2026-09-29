/**
 * Puts secrets on the OS clipboard and takes them off again. Implemented in
 * `infrastructure` against Argus's own clipboard commands, so copy buttons
 * and the auto-clear timer don't touch the web clipboard API directly.
 */
export interface ClipboardWriter {
  /**
   * Copies `value`, kept out of clipboard history and cloud clipboard where
   * the OS supports that. Resolves to an id for this copy, only ever meant to
   * be handed back to `clearIfUnchanged`.
   */
  writeText(value: string): Promise<number>;
  /**
   * Empties the clipboard if it still holds the copy `copyId` names. Anything
   * copied since, by Argus or by the user, is left alone.
   */
  clearIfUnchanged(copyId: number): Promise<void>;
}
