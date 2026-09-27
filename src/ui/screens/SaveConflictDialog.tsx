interface SaveConflictDialogProps {
  onDiscard: () => void;
  onOverwrite: () => void;
}

export function SaveConflictDialog({ onDiscard, onOverwrite }: SaveConflictDialogProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h2>Vault changed on disk</h2>
        <p>
          This vault file was modified outside Argus since it was last opened or saved here.
          Overwriting will discard that external change.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onDiscard}>
            Discard my changes &amp; lock
          </button>
          <button type="button" className="btn-primary" onClick={onOverwrite}>
            Overwrite anyway
          </button>
        </div>
      </div>
    </div>
  );
}
