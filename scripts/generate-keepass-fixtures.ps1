# Regenerates the KeePass-written vaults in tests/fixtures/keepass/.
#
# The KDBX fidelity tests need files written by a real KeePass, not by kdbxweb:
# a kdbxweb-made file only proves kdbxweb agrees with itself. This script loads
# KeePassLib out of an installed KeePass 2.x (KeePass.exe is a .NET assembly)
# and writes the vaults with KeePass's own serializer.
#
# Run from the repo root in Windows PowerShell 5.1 (it needs .NET Framework):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-keepass-fixtures.ps1
#
# The output isn't reproducible byte for byte (KeePass draws fresh UUIDs, salts
# and IVs each run), so only regenerate when the fixtures need new content.

param(
  [string]$KeePassPath = "C:\Program Files\KeePass Password Safe 2\KeePass.exe",
  [string]$OutDir = (Join-Path $PSScriptRoot "..\tests\fixtures\keepass")
)

$ErrorActionPreference = "Stop"
[void][Reflection.Assembly]::LoadFrom($KeePassPath)

# Must match tests/infrastructure/keepass-fixtures.ts.
$MasterPassword = "Fixture-passw0rd!"

$OutDir = [IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force $OutDir | Out-Null

# Two distinct 1x1 PNGs, for custom icons.
$IconRed = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==")
$IconBlue = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")

function New-Str([string]$value, [bool]$protect = $false) {
  New-Object KeePassLib.Security.ProtectedString($protect, $value)
}

function New-Entry($db, $group, [hashtable]$fields) {
  $entry = New-Object KeePassLib.PwEntry($true, $true)
  foreach ($name in $fields.Keys) {
    $protect = $name -eq "Password"
    $entry.Strings.Set($name, (New-Str $fields[$name] $protect))
  }
  $group.AddEntry($entry, $true)
  $entry
}

function Add-Attachment($entry, [string]$name, [byte[]]$bytes, [bool]$protect = $false) {
  $entry.Binaries.Set($name, (New-Object KeePassLib.Security.ProtectedBinary($protect, $bytes)))
}

function Add-CustomIcon($db, [byte[]]$png, [string]$name) {
  $icon = New-Object KeePassLib.PwCustomIcon((New-Object KeePassLib.PwUuid($true)), $png)
  # KDBX 4.1 fields, which KeePass only writes into a 4.1 file.
  if ($name) {
    $icon.Name = $name
    $icon.LastModificationTime = [DateTime]::new(2026, 1, 2, 3, 4, 5, [DateTimeKind]::Utc)
  }
  $db.CustomIcons.Add($icon)
  $icon.Uuid
}

function New-Database([string]$name, $compositeKey) {
  $db = New-Object KeePassLib.PwDatabase
  $db.New((New-Object KeePassLib.Serialization.IOConnectionInfo), $compositeKey)
  $db.Name = $name
  $db.Description = "Written by KeePass for Argus's fidelity tests."
  $db.DefaultUserName = "fixture-user"
  $db.RootGroup.Name = $name
  $db
}

function New-PasswordKey([bool]$withKeyFile = $false, [string]$keyFilePath) {
  $key = New-Object KeePassLib.Keys.CompositeKey
  $key.AddUserKey((New-Object KeePassLib.Keys.KcpPassword($MasterPassword)))
  if ($withKeyFile) {
    $key.AddUserKey((New-Object KeePassLib.Keys.KcpKeyFile($keyFilePath)))
  }
  $key
}

function Use-AesKdf($db) {
  $kdf = New-Object KeePassLib.Cryptography.KeyDerivation.AesKdf
  $params = $kdf.GetDefaultParameters()
  # Low on purpose: this is a test fixture, and it keeps the suite fast.
  $params.SetUInt64([KeePassLib.Cryptography.KeyDerivation.AesKdf]::ParamRounds, 6000)
  $db.KdfParameters = $params
  $db.DataCipherUuid = [KeePassLib.Cryptography.Cipher.StandardAesEngine]::AesUuid
}

function Use-Argon2id($db) {
  $kdf = New-Object KeePassLib.Cryptography.KeyDerivation.Argon2Kdf([KeePassLib.Cryptography.KeyDerivation.Argon2Type]::ID)
  $params = $kdf.GetDefaultParameters()
  $params.SetUInt64([KeePassLib.Cryptography.KeyDerivation.Argon2Kdf]::ParamMemory, 1MB)
  $params.SetUInt64([KeePassLib.Cryptography.KeyDerivation.Argon2Kdf]::ParamIterations, 2)
  $params.SetUInt32([KeePassLib.Cryptography.KeyDerivation.Argon2Kdf]::ParamParallelism, 2)
  $db.KdfParameters = $params
  # ChaCha20Engine.ChaCha20Uuid isn't public, so use the KDBX cipher ID directly.
  $chaCha20 = [byte[]](0xd6, 0x03, 0x8a, 0x2b, 0x8b, 0x6f, 0x4c, 0xb5, 0xa5, 0x24, 0x33, 0x9a, 0x31, 0xdb, 0xb5, 0x9a)
  $db.DataCipherUuid = New-Object KeePassLib.PwUuid(, $chaCha20)
}

function Add-RecycleBin($db) {
  $bin = New-Object KeePassLib.PwGroup($true, $true, "Recycle Bin", [KeePassLib.PwIcon]::TrashBin)
  $bin.EnableAutoType = $false
  $bin.EnableSearching = $false
  $db.RootGroup.AddGroup($bin, $true)
  $db.RecycleBinEnabled = $true
  $db.RecycleBinUuid = $bin.Uuid
  $binned = New-Entry $db $bin @{ Title = "Deleted Login"; UserName = "old"; Password = "gone-but-kept" }
  $binned | Out-Null
}

# Content shared by both format fixtures. $kdbx4 adds the features that force
# KeePass to write KDBX 4.x; left out, KeePass writes KDBX 3.1.
function Add-SharedContent($db, [bool]$kdbx4) {
  $root = $db.RootGroup
  $iconName = if ($kdbx4) { "Red square" } else { $null }
  $redIcon = Add-CustomIcon $db $IconRed $iconName
  $blueIcon = Add-CustomIcon $db $IconBlue $null

  $email = New-Object KeePassLib.PwGroup($true, $true, "Email", [KeePassLib.PwIcon]::EMail)
  $email.Notes = "Group notes survive too."
  $email.CustomIconUuid = $blueIcon
  $root.AddGroup($email, $true)
  $work = New-Object KeePassLib.PwGroup($true, $true, "Work", [KeePassLib.PwIcon]::Folder)
  $work.DefaultAutoTypeSequence = "{USERNAME}{TAB}{TAB}{PASSWORD}{ENTER}"
  $email.AddGroup($work, $true)

  # The entry the tests edit through Argus. It already has history and an
  # attachment, so the tests can check both survive an edit.
  $edited = New-Entry $db $root @{
    Title = "Edited In Argus"; UserName = "editor"; Password = "first-password"
    URL = "https://edited.example.com"; Notes = "Line one`r`nLine two"
  }
  Add-Attachment $edited "notes.txt" ([Text.Encoding]::UTF8.GetBytes("attachment on the edited entry"))
  $edited.CreateBackup($db)
  $edited.Strings.Set("Password", (New-Str "second-password" $true))
  $edited.Touch($true, $false)

  # Kept ASCII-only: Windows PowerShell 5.1 reads a BOM-less script as ANSI.
  $unicode = "$([char]0x00FC)nicode $([char]0x2713)"
  $full = New-Entry $db $root @{
    Title = "Everything Entry"; UserName = "alice@example.com"; Password = "S3cret!pass"
    URL = "https://login.example.com/signin"; Notes = "Notes with <xml> & ""quotes"" and $unicode"
  }
  $full.Strings.Set("Recovery Codes", (New-Str "1111-2222`n3333-4444"))
  $full.Strings.Set("PIN", (New-Str "4321" $true))
  # KeePassXC's TOTP convention, plus KeePass 2's own native TOTP fields.
  $full.Strings.Set("otp", (New-Str "otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP&period=30&digits=6&issuer=Example" $true))
  $full.Strings.Set("TimeOtp-Secret-Base32", (New-Str "JBSWY3DPEHPK3PXP" $true))
  Add-Attachment $full "photo.bin" ([byte[]](0..255))
  Add-Attachment $full "secret.txt" ([Text.Encoding]::UTF8.GetBytes("a protected attachment")) $true
  $full.CustomIconUuid = $redIcon
  $full.IconId = [KeePassLib.PwIcon]::Key
  $full.ForegroundColor = [Drawing.Color]::FromArgb(255, 200, 30, 30)
  $full.BackgroundColor = [Drawing.Color]::FromArgb(255, 240, 240, 200)
  $full.OverrideUrl = "cmd://notepad.exe"
  $full.Tags.Add("finance")
  $full.Tags.Add("shared")
  $full.Expires = $true
  $full.ExpiryTime = [DateTime]::new(2031, 5, 17, 12, 0, 0, [DateTimeKind]::Utc)
  $full.AutoType.DefaultSequence = "{USERNAME}{TAB}{PASSWORD}{ENTER}"
  $full.AutoType.Add((New-Object KeePassLib.Collections.AutoTypeAssociation("*Example Login*", "{PASSWORD}{ENTER}")))
  # Two history revisions, the older one with a different attachment set.
  $full.CreateBackup($db)
  $full.Strings.Set("Password", (New-Str "S3cret!pass-v2" $true))
  $full.Binaries.Remove("photo.bin") | Out-Null
  $full.CreateBackup($db)
  $full.Strings.Set("Password", (New-Str "S3cret!pass" $true))
  Add-Attachment $full "photo.bin" ([byte[]](0..255))

  $reference = New-Entry $db $root @{
    Title = "Reference Entry"; UserName = "{REF:U@I:$($full.Uuid.ToHexString())}"
    Password = "{REF:P@I:$($full.Uuid.ToHexString())}"
  }
  $reference | Out-Null

  $nested = New-Entry $db $work @{ Title = "Work Mail"; UserName = "bob"; Password = "work-pass"; URL = "mail.example.com" }
  $nested.AutoType.Enabled = $false
  $nested.AutoType.ObfuscationOptions = [KeePassLib.Collections.AutoTypeObfuscationOptions]::UseClipboard

  if ($kdbx4) {
    $db.CustomData.Set("KPXC_DECRYPTION_TIME_PREFERENCE", "1000")
    $db.PublicCustomData.SetString("PublicKey", "public value")
    $full.CustomData.Set("KPXC_BROWSER_HIDE_ENTRY", "false")
    $email.CustomData.Set("GroupPlugin", "group value")
    $email.Tags.Add("group-tag")
    $full.QualityCheck = $false
  }

  Add-RecycleBin $db
}

# Recent KeePass versions write KDBX 4.0 at minimum, even for a file that
# would fit in 3.1, so the KDBX3 fixture has to force its version. The
# version constants and KdbxFile's version override are internal, hence the
# reflection.
$NonPublic = [Reflection.BindingFlags]"Static,Instance,NonPublic,Public"
$KdbxFileType = [KeePassLib.Serialization.KdbxFile]
$Kdbx31 = [uint32]$KdbxFileType.GetField("FileVersion32_3_1", $NonPublic).GetValue($null)

function Save-Database($db, [string]$fileName, [uint32]$forceVersion = 0) {
  $path = Join-Path $OutDir $fileName
  if (Test-Path $path) { Remove-Item $path }
  $file = New-Object KeePassLib.Serialization.KdbxFile($db)
  if ($forceVersion -ne 0) {
    $KdbxFileType.GetField("m_uForceVersion", $NonPublic).SetValue($file, $forceVersion)
  }
  $stream = [IO.File]::Create($path)
  try {
    $file.Save($stream, $null, [KeePassLib.Serialization.KdbxFormat]::Default, (New-Object KeePassLib.Interfaces.NullStatusLogger))
  } finally {
    $stream.Dispose()
  }
  $db.Close()
  Write-Host "Wrote $path"
}

$kdbx3 = New-Database "KeePass KDBX3" (New-PasswordKey)
Use-AesKdf $kdbx3
Add-SharedContent $kdbx3 $false
Save-Database $kdbx3 "kdbx3-aes.kdbx" $Kdbx31

$kdbx4 = New-Database "KeePass KDBX4" (New-PasswordKey)
Use-Argon2id $kdbx4
Add-SharedContent $kdbx4 $true
Save-Database $kdbx4 "kdbx4-argon2id.kdbx"

$keyFilePath = Join-Path $OutDir "keyfile.keyx"
if (Test-Path $keyFilePath) { Remove-Item $keyFilePath }
[KeePassLib.Keys.KcpKeyFile]::Create($keyFilePath, $null)
$keyed = New-Database "KeePass Key File" (New-PasswordKey $true $keyFilePath)
Use-Argon2id $keyed
New-Entry $keyed $keyed.RootGroup @{ Title = "Keyed Entry"; UserName = "k"; Password = "keyed-pass" } | Out-Null
Save-Database $keyed "keyfile.kdbx"
