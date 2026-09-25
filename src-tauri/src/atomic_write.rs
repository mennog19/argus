use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Suffix of the scratch file a save is staged in before it replaces the real one.
const TEMP_SUFFIX: &str = ".tmp";

fn temp_path_for(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(TEMP_SUFFIX);
    PathBuf::from(name)
}

/// Replaces the file at `path` with `bytes` so that a crash at any point leaves
/// either the complete old contents or the complete new contents, never a
/// truncated mix.
///
/// The bytes are written to a sibling temp file and flushed to disk before being
/// renamed over `path`. `std::fs::rename` replaces an existing file on every
/// platform, including Windows. A failed write removes the temp file and leaves
/// `path` untouched.
pub fn write_file_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let temp_path = temp_path_for(path);

    let staged = stage(&temp_path, bytes).and_then(|()| fs::rename(&temp_path, path));
    if staged.is_err() {
        // Best effort: the original error is the one worth reporting.
        let _ = fs::remove_file(&temp_path);
    }
    staged
}

fn stage(temp_path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = File::create(temp_path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

#[cfg(test)]
mod tests {
    use super::{temp_path_for, write_file_atomic};
    use std::fs;
    use std::path::PathBuf;

    /// A fresh, empty directory unique to one test, so parallel tests can't collide.
    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("argus-atomic-write-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn creates_a_file_that_does_not_exist_yet() {
        let dir = scratch_dir("create");
        let path = dir.join("new.kdbx");

        write_file_atomic(&path, b"fresh").unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"fresh");
    }

    #[test]
    fn replaces_the_contents_of_an_existing_file() {
        let dir = scratch_dir("replace");
        let path = dir.join("mine.kdbx");
        fs::write(&path, b"old contents that are longer than the new ones").unwrap();

        write_file_atomic(&path, b"new").unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"new");
    }

    #[test]
    fn leaves_no_temp_file_behind_after_success() {
        let dir = scratch_dir("cleanup");
        let path = dir.join("mine.kdbx");

        write_file_atomic(&path, b"data").unwrap();

        assert!(!temp_path_for(&path).exists());
    }

    #[test]
    fn keeps_the_original_and_cleans_up_when_the_rename_fails() {
        let dir = scratch_dir("rename-fails");
        // A non-empty directory can't be replaced by a file, so the rename fails
        // after the temp file has been fully written.
        let path = dir.join("mine.kdbx");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("occupied"), b"x").unwrap();

        let result = write_file_atomic(&path, b"data");

        assert!(result.is_err());
        assert!(path.join("occupied").exists());
        assert!(!temp_path_for(&path).exists());
    }

    #[test]
    fn fails_when_the_parent_directory_is_missing() {
        let dir = scratch_dir("missing-parent");
        let path = dir.join("nope").join("mine.kdbx");

        assert!(write_file_atomic(&path, b"data").is_err());
    }

    #[test]
    fn names_the_temp_file_after_the_target() {
        let temp = temp_path_for(&PathBuf::from("C:/vaults/mine.kdbx"));

        assert_eq!(temp, PathBuf::from("C:/vaults/mine.kdbx.tmp"));
    }
}
