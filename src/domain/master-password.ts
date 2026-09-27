/**
 * Shortest master password Argus accepts when creating a vault or changing
 * its password. Matches the default weak-password bar in
 * `PasswordHealthPolicy`, but only length is enforced: a long all-lowercase
 * passphrase is fine as a master password even though the health check
 * would call it weak for using few character classes.
 */
export const MASTER_PASSWORD_MIN_LENGTH = 12;
