/** A newer version of Argus than the one running. */
export interface AvailableUpdate {
  readonly version: string;
  readonly currentVersion: string;
  /** What the release says about itself, if anything. Plain text. */
  readonly notes?: string;
}

/** How much of the update has downloaded. `totalBytes` is absent when unknown. */
export interface UpdateDownloadProgress {
  readonly downloadedBytes: number;
  readonly totalBytes?: number;
}

/**
 * Finds and installs new versions of Argus. Implemented in `infrastructure`
 * against the Rust side, which fetches the release feed and refuses any
 * installer not signed with Argus's release key.
 */
export interface Updater {
  /** Resolves to the newer version, or `undefined` when Argus is up to date. */
  checkForUpdate(): Promise<AvailableUpdate | undefined>;
  /**
   * Downloads and installs the update the last check found. Installing closes
   * Argus and starts the new version, so this only settles on failure.
   */
  installUpdate(onProgress: (progress: UpdateDownloadProgress) => void): Promise<void>;
}
