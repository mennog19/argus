import { TotpConfig } from "../../../domain";
import { formatTotpCode } from "../../format";
import { ClipboardCopy } from "../../use-clipboard-copy";
import { useTotpCode } from "../../use-totp-code";
import { CopyableFieldRow } from "./CopyableFieldRow";

interface TotpCardProps {
  config: TotpConfig;
  clipboard: ClipboardCopy;
  clipboardClearSeconds: number;
}

export function TotpCard({ config, clipboard, clipboardClearSeconds }: TotpCardProps) {
  const code = useTotpCode(config);
  return (
    <div className="detail-card">
      <CopyableFieldRow
        field="totp"
        label="Authenticator code"
        value={code ? formatTotpCode(code.value) : "···· ··"}
        valueClassName="totp-code-value"
        copyLabel="Copy authenticator code"
        copyValue={code?.value}
        clipboard={clipboard}
        clipboardClearSeconds={clipboardClearSeconds}
        footer={
          <div className="totp-progress-bar" aria-hidden="true">
            <div
              className="totp-progress-bar-fill"
              style={{
                width: code ? `${(code.secondsRemaining / config.period) * 100}%` : "0%",
              }}
            />
          </div>
        }
      />
    </div>
  );
}
