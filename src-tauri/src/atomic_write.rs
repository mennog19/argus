use std::collections::hash_map::RandomState;
use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::hash::{BuildHasher, Hasher};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Suffix of the scratch file a save is staged in before it replaces the real one.
const TEMP_SUFFIX: &str = ".tmp";

/// How many fresh names to try before giving up. A clash needs someone to have
/// guessed a 64-bit random name, so running out means something is wrong.
const MAX_TEMP_ATTEMPTS: u32 = 8;

/// 64 bits no one else can predict. `RandomState` is seeded from the OS's
/// random source once per process; the counter and clock keep two calls in
/// the same instant from colliding.
fn random_suffix() -> u64 {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u64(COUNTER.fetch_add(1, Ordering::Relaxed));
    hasher.write_u128(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_nanos()),
    );
    hasher.finish()
}

/// A sibling of `path` to stage a save in: `.mine.kdbx.<16 hex digits>.tmp`.
///
/// It has to sit in the same directory, since only a rename within one
/// filesystem is atomic. The random part stops anyone who can write to that
/// directory from planting something at the name ahead of time.
fn temp_path_for(path: &Path, suffix: u64) -> PathBuf {
    let mut name = OsString::from(".");
    name.push(path.file_name().unwrap_or_else(|| "vault".as_ref()));
    name.push(format!(".{suffix:016x}{TEMP_SUFFIX}"));
    path.with_file_name(name)
}

/// Creates a brand-new temp file next to `path`. `create_new` refuses anything
/// already at the name -- a file, or a symlink pointing somewhere else -- so
/// the bytes can only ever land in a file this call made.
fn create_temp_file(path: &Path) -> io::Result<(PathBuf, File)> {
    let mut last_error = None;
    for _ in 0..MAX_TEMP_ATTEMPTS {
        let temp_path = temp_path_for(path, random_suffix());
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => return Ok((temp_path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => last_error = Some(error),
            Err(error) => return Err(error),
        }
    }
    Err(last_error.expect("at least one attempt was made"))
}

/// Replaces the file at `path` with `bytes` so that a crash at any point leaves
/// either the complete old contents or the complete new contents, never a
/// truncated mix.
///
/// The bytes are written to a new, randomly named sibling file and flushed to
/// disk before being renamed over `path`. `std::fs::rename` replaces an
/// existing file on every platform, including Windows. A failed write removes
/// the temp file and leaves `path` untouched, so at most one temp file exists
/// per save in progress and none once it finishes.
pub fn write_file_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let (temp_path, file) = create_temp_file(path)?;

    let staged = stage(file, bytes).and_then(|()| fs::rename(&temp_path, path));
    if staged.is_err() {
        // Best effort: the original error is the one worth reporting.
        let _ = fs::remove_file(&temp_path);
    }
    staged
}

fn stage(mut file: File, bytes: &[u8]) -> io::Result<()> {
    file.write_all(bytes)?;
    file.sync_all()
}

#[cfg(test)]
mod tests {
    use super::{create_temp_file, random_suffix, temp_path_for, write_file_atomic};
    use std::fs;
    use std::path::{Path, PathBuf};

    /// A fresh, empty directory unique to one test, so parallel tests can't collide.
    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("argus-atomic-write-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Every entry in `dir` other than `keep`, by name.
    fn leftovers(dir: &Path, keep: &str) -> Vec<String> {
        fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|name| name != keep)
            .collect()
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
        write_file_atomic(&path, b"again").unwrap();

        assert!(leftovers(&dir, "mine.kdbx").is_empty());
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
        assert!(leftovers(&dir, "mine.kdbx").is_empty());
    }

    #[test]
    fn fails_when_the_parent_directory_is_missing() {
        let dir = scratch_dir("missing-parent");
        let path = dir.join("nope").join("mine.kdbx");

        assert!(write_file_atomic(&path, b"data").is_err());
    }

    #[test]
    fn names_the_temp_file_after_the_target_with_a_random_part() {
        let temp = temp_path_for(&PathBuf::from("C:/vaults/mine.kdbx"), 0xabc);

        assert_eq!(
            temp,
            PathBuf::from("C:/vaults/.mine.kdbx.0000000000000abc.tmp")
        );
    }

    #[test]
    fn picks_a_different_temp_name_every_time() {
        assert_ne!(random_suffix(), random_suffix());
    }

    #[test]
    fn never_opens_something_already_at_the_temp_name() {
        let dir = scratch_dir("no-clobber");
        let path = dir.join("mine.kdbx");

        let (first, _file) = create_temp_file(&path).unwrap();
        // Nothing opens an existing name: a second call gets its own file.
        let (second, _file) = create_temp_file(&path).unwrap();

        assert_ne!(first, second);
        assert!(first.starts_with(&dir) && second.starts_with(&dir));
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_a_symlink_planted_in_the_folder() {
        let dir = scratch_dir("symlink");
        let path = dir.join("mine.kdbx");
        let victim = dir.join("victim");
        fs::write(&victim, b"untouched").unwrap();
        // The old fixed name, `mine.kdbx.tmp`, is exactly what an attacker
        // would have planted a link at.
        std::os::unix::fs::symlink(&victim, dir.join("mine.kdbx.tmp")).unwrap();

        write_file_atomic(&path, b"data").unwrap();

        assert_eq!(fs::read(&victim).unwrap(), b"untouched");
        assert_eq!(fs::read(&path).unwrap(), b"data");
    }
}
