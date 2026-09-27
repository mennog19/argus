interface AutoTypeErrorToastProps {
  message: string;
  onDismiss: () => void;
}

export function AutoTypeErrorToast({ message, onDismiss }: AutoTypeErrorToastProps) {
  return (
    <div className="auto-type-toast" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="auto-type-toast-dismiss"
        aria-label="Dismiss auto-type error"
        onClick={onDismiss}
      >
        &times;
      </button>
    </div>
  );
}
