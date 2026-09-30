import { VaultFileInfo } from "../../../application/vault-access-service";
import { basename, formatFileSize, formatRelativeTime, formatVaultFormat } from "../../format";

interface VaultInfoSectionProps {
  filePath: string;
  fileInfo: VaultFileInfo | undefined;
  entryCount: number;
}

export function VaultInfoSection({ filePath, fileInfo, entryCount }: VaultInfoSectionProps) {
  return (
    <section className="detail-section">
      <div className="detail-section-label">Vault</div>
      <div className="detail-card">
        <div className="detail-field-row">
          <span className="detail-field-row-label">File</span>
          <span className="detail-field-value">{basename(filePath)}</span>
        </div>
        <div className="detail-field-row">
          <span className="detail-field-row-label">Passwords</span>
          <span className="detail-field-value">{entryCount}</span>
        </div>
        <div className="detail-field-row">
          <span className="detail-field-row-label">Size</span>
          <span className="detail-field-value">
            {fileInfo ? formatFileSize(fileInfo.sizeBytes) : "—"}
          </span>
        </div>
        <div className="detail-field-row">
          <span className="detail-field-row-label">Format</span>
          <span className="detail-field-value">
            {fileInfo ? formatVaultFormat(fileInfo.format) : "—"}
          </span>
        </div>
        <div className="detail-field-row">
          <span className="detail-field-row-label">Last saved</span>
          <span className="detail-field-value" style={{ textTransform: "capitalize" }}>
            {fileInfo ? formatRelativeTime(new Date(fileInfo.lastModifiedMs).toISOString()) : "—"}
          </span>
        </div>
      </div>
    </section>
  );
}
