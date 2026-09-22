import { useEffect, useState } from "react";
import { generateTotpCode, TotpCode, TotpConfig } from "../domain";

const TICK_INTERVAL_MS = 1000;

/**
 * Live TOTP code + seconds-remaining for a config, recomputed every second
 * and immediately whenever `config` changes (e.g. the selected entry
 * changes). Returns `undefined` when there's no config to generate from.
 */
export function useTotpCode(config: TotpConfig | undefined): TotpCode | undefined {
  const [code, setCode] = useState<TotpCode | undefined>(undefined);

  useEffect(() => {
    if (!config) {
      return;
    }

    let cancelled = false;
    const tick = () => {
      void generateTotpCode(config).then((next) => {
        if (!cancelled) {
          setCode(next);
        }
      });
    };

    tick();
    const intervalId = setInterval(tick, TICK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [config]);

  return config ? code : undefined;
}
