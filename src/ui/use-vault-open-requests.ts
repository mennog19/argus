import { useEffect, useRef } from "react";
import { VaultOpenRequests } from "../application/vault-open-requests";

/** Calls `onOpen` with the path of each vault the OS asks Argus to open. */
export function useVaultOpenRequests(
  requests: VaultOpenRequests,
  onOpen: (filePath: string) => void,
): void {
  // Read through a ref so a fresh callback each render doesn't resubscribe,
  // which would hand over the launch vault again.
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => requests.onOpenRequest((filePath) => onOpenRef.current(filePath)), [requests]);
}
