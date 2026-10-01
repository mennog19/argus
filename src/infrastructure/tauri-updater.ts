import { Channel, invoke } from "@tauri-apps/api/core";
import { AvailableUpdate, UpdateDownloadProgress, Updater } from "../application/updater";

/** `AvailableUpdate` as `updater.rs` sends it. */
interface RawAvailableUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
}

/** `DownloadProgress` as `updater.rs` sends it. */
interface RawDownloadProgress {
  downloaded: number;
  total: number | null;
}

export class TauriUpdater implements Updater {
  async checkForUpdate(): Promise<AvailableUpdate | undefined> {
    const raw = await invoke<RawAvailableUpdate | null>("check_for_update");
    if (raw === null) {
      return undefined;
    }
    return {
      version: raw.version,
      currentVersion: raw.currentVersion,
      ...(raw.notes === null ? {} : { notes: raw.notes }),
    };
  }

  async installUpdate(onProgress: (progress: UpdateDownloadProgress) => void): Promise<void> {
    const channel = new Channel<RawDownloadProgress>((progress) =>
      onProgress({
        downloadedBytes: progress.downloaded,
        ...(progress.total === null ? {} : { totalBytes: progress.total }),
      }),
    );
    await invoke("install_update", { onProgress: channel });
  }
}
