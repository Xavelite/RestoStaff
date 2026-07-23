param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z]{20}$')]
  [string]$ProjectRef,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://[^/]+$')]
  [string]$AppOrigin
)

$ErrorActionPreference = 'Stop'

function Get-SupabaseAccessToken {
  if ($env:SUPABASE_ACCESS_TOKEN) { return $env:SUPABASE_ACCESS_TOKEN }
  if ($env:OS -ne 'Windows_NT') {
    throw 'Set SUPABASE_ACCESS_TOKEN before configuring hosted Auth.'
  }

  if (-not ('RestogogoCredentialReader' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class RestogogoCredentialReader {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct Credential {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }

  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredRead(string target, uint type, int reserved, out IntPtr pointer);

  [DllImport("advapi32.dll", SetLastError = true)]
  private static extern void CredFree(IntPtr buffer);

  public static byte[] Read(string target) {
    IntPtr pointer;
    if (!CredRead(target, 1, 0, out pointer)) {
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    try {
      var credential = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
      var value = new byte[credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, value, 0, (int)credential.CredentialBlobSize);
      return value;
    } finally {
      CredFree(pointer);
    }
  }
}
'@
  }

  $bytes = [RestogogoCredentialReader]::Read('Supabase CLI:supabase')
  return [Text.Encoding]::UTF8.GetString($bytes).Trim([char]0)
}

$projects = (& npx supabase projects list -o json | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Supabase project discovery failed.' }
$project = $projects | Where-Object { $_.id -eq $ProjectRef } | Select-Object -First 1
if (-not $project) { throw 'The requested Supabase project does not exist.' }
if ($project.name -cne 'Restogogo Production') {
  throw 'Hosted production Auth configuration accepts only Restogogo Production.'
}

$token = Get-SupabaseAccessToken
if ($token -notmatch '^sbp_[A-Za-z0-9_-]+$') {
  throw 'Supabase access token is missing or invalid.'
}
$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
$uri = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"
$body = @{
  site_url = $AppOrigin
  uri_allow_list = "$AppOrigin/**"
  disable_signup = $false
} | ConvertTo-Json

try {
  Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body $body | Out-Null
  $config = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
  if ($config.site_url -cne $AppOrigin -or $config.uri_allow_list -cne "$AppOrigin/**") {
    throw 'Hosted Auth returned unexpected URL configuration.'
  }
  Write-Host "Hosted Auth now uses $AppOrigin."
} finally {
  $token = $null
  $headers = $null
}
