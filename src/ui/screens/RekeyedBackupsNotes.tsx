import { MasterPasswordChangeResult } from "../../application/vault-access-service";

interface RekeyedBackupsNotesProps {
  result: MasterPasswordChangeResult;
  /** What the backups now open with, e.g. "with the new password". */
  nowOpen: string;
  /** What copies that weren't re-keyed still open with, e.g. "with the old password". */
  stillOpen: string;
}

function removedBackupsNote(paths: string[]): string {
  return paths.length === 1
    ? "1 backup couldn't be re-encrypted and was deleted."
    : `${paths.length} backups couldn't be re-encrypted and were deleted.`;
}

/**
 * What became of a vault's other copies after its password or key file
 * changed: the rolling backups Argus re-keyed, the ones it couldn't, and the
 * ones it has no way of knowing about.
 */
export function RekeyedBackupsNotes({ result, nowOpen, stillOpen }: RekeyedBackupsNotesProps) {
  return (
    <>
      <div className="danger-zone-row-hint">
        The vault&apos;s .bak backups were re-encrypted {nowOpen} too.
        {result.removedBackups.length > 0 && ` ${removedBackupsNote(result.removedBackups)}`}
      </div>
      {result.unprotectedBackups.length > 0 && (
        <div className="field-error">
          These backups could not be re-encrypted or deleted and may still open {stillOpen}. Delete
          them yourself: {result.unprotectedBackups.join(", ")}
        </div>
      )}
      <div className="danger-zone-row-hint">
        Copies made outside Argus, such as cloud sync version history or files you copied yourself,
        still open {stillOpen}.
      </div>
    </>
  );
}
