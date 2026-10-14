# Maintenance Records - hidden background launcher
# Invoked by the root 启动.bat; runs with no console window.
#
# Uses CreateProcess directly with CREATE_NO_WINDOW and inheritable log file
# handles. This (and only this) prevents both the service consoles AND the
# Windows Terminal tabs that tsx's child node process otherwise allocates.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root '.run'
$logDir = Join-Path $runDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not ('MrHiddenRunner' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class MrHiddenRunner {
  [StructLayout(LayoutKind.Sequential)]
  public struct SECURITY_ATTRIBUTES {
    public int nLength;
    public IntPtr lpSecurityDescriptor;
    public bool bInheritHandle;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct STARTUPINFO {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public uint dwX;
    public uint dwY;
    public uint dwXSize;
    public uint dwYSize;
    public uint dwXCountChars;
    public uint dwYCountChars;
    public uint dwFillAttribute;
    public uint dwFlags;
    public short wShowWindow;
    public short cbReserved2;
    public IntPtr lpReserved2;
    public IntPtr hStdInput;
    public IntPtr hStdOutput;
    public IntPtr hStdError;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION {
    public IntPtr hProcess;
    public IntPtr hThread;
    public int dwProcessId;
    public int dwThreadId;
  }

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern bool CreateProcess(
    string lpApplicationName,
    string lpCommandLine,
    IntPtr lpProcessAttributes,
    IntPtr lpThreadAttributes,
    bool bInheritHandles,
    uint dwCreationFlags,
    IntPtr lpEnvironment,
    string lpCurrentDirectory,
    [In] ref STARTUPINFO lpStartupInfo,
    out PROCESS_INFORMATION lpProcessInformation);

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern IntPtr CreateFile(
    string lpFileName,
    uint dwDesiredAccess,
    uint dwShareMode,
    ref SECURITY_ATTRIBUTES lpSecurityAttributes,
    uint dwCreationDisposition,
    uint dwFlagsAndAttributes,
    IntPtr hTemplateFile);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr hObject);

  private const uint GENERIC_READ = 0x80000000;
  private const uint GENERIC_WRITE = 0x40000000;
  private const uint FILE_SHARE_READ = 0x00000001;
  private const uint FILE_SHARE_WRITE = 0x00000002;
  private const uint FILE_SHARE_DELETE = 0x00000004;
  private const uint OPEN_EXISTING = 3;
  private const uint CREATE_ALWAYS = 2;
  private const uint STARTF_USESTDHANDLES = 0x00000100;
  private const uint CREATE_NO_WINDOW = 0x08000000;

  private static IntPtr OpenHandle(string path, uint access, uint disposition) {
    SECURITY_ATTRIBUTES sa = new SECURITY_ATTRIBUTES();
    sa.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
    sa.bInheritHandle = true;
    sa.lpSecurityDescriptor = IntPtr.Zero;
    IntPtr h = CreateFile(path, access,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      ref sa, disposition, 0, IntPtr.Zero);
    if (h == new IntPtr(-1)) {
      throw new Exception("Cannot open " + path + " (win32 error " + Marshal.GetLastWin32Error() + ")");
    }
    return h;
  }

  public static int StartLogged(string nodeExe, string arguments, string workDir,
                                string stdinDevice, string outLog, string errLog) {
    IntPtr hIn = OpenHandle(stdinDevice, GENERIC_READ, OPEN_EXISTING);
    IntPtr hOut = OpenHandle(outLog, GENERIC_WRITE, CREATE_ALWAYS);
    IntPtr hErr = OpenHandle(errLog, GENERIC_WRITE, CREATE_ALWAYS);
    try {
      STARTUPINFO si = new STARTUPINFO();
      si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
      si.dwFlags = STARTF_USESTDHANDLES;
      si.hStdInput = hIn;
      si.hStdOutput = hOut;
      si.hStdError = hErr;
      PROCESS_INFORMATION pi;
      string commandLine = "\"" + nodeExe + "\" " + arguments;
      bool ok = CreateProcess(nodeExe, commandLine,
        IntPtr.Zero, IntPtr.Zero, true, CREATE_NO_WINDOW,
        IntPtr.Zero, workDir, ref si, out pi);
      if (!ok) {
        throw new Exception("CreateProcess failed (win32 error " + Marshal.GetLastWin32Error() + ")");
      }
      CloseHandle(pi.hThread);
      CloseHandle(pi.hProcess);
      return pi.dwProcessId;
    } finally {
      CloseHandle(hIn);
      CloseHandle(hOut);
      CloseHandle(hErr);
    }
  }
}
'@
}

function Test-Port($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Show-Message($text) {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
  [System.Windows.Forms.MessageBox]::Show(
    $text, 'Maintenance Records',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
}

if (Test-Port 5173) {
  Start-Process 'http://127.0.0.1:5173/'
  exit 0
}

$node = (Get-Command node).Source
$tsx = Join-Path $root 'node_modules\tsx\dist\cli.mjs'
$vite = Join-Path $root 'node_modules\vite\bin\vite.js'
$serverDir = Join-Path $root 'apps\server'
$webDir = Join-Path $root 'apps\web'
$nulDevice = '\\.\NUL'

try {
  $serverPid = [MrHiddenRunner]::StartLogged($node, ('"' + $tsx + '" watch src/index.ts'),
    $serverDir, $nulDevice,
    (Join-Path $logDir 'server.out.log'), (Join-Path $logDir 'server.err.log'))

  $webPid = [MrHiddenRunner]::StartLogged($node, ('"' + $vite + '"'),
    $webDir, $nulDevice,
    (Join-Path $logDir 'web.out.log'), (Join-Path $logDir 'web.err.log'))
} catch {
  Show-Message ("Failed to start services:`n" + $_.Exception.Message)
  exit 1
}

Set-Content -Path (Join-Path $runDir 'server.pid') -Value $serverPid -Encoding ascii
Set-Content -Path (Join-Path $runDir 'web.pid') -Value $webPid -Encoding ascii

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  if ((Get-Process -Id $serverPid -ErrorAction SilentlyContinue) -eq $null) { break }
  if ((Get-Process -Id $webPid -ErrorAction SilentlyContinue) -eq $null) { break }
  if (Test-Port 5173) {
    try {
      Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {}
  }
}

if ($ready) {
  Start-Process 'http://127.0.0.1:5173/'
  exit 0
}

# Startup failed: clean up and show the log locations to the user.
foreach ($id in @($serverPid, $webPid)) {
  & taskkill.exe /PID $id /T /F 2>$null | Out-Null
}
Remove-Item -Path (Join-Path $runDir 'server.pid'), (Join-Path $runDir 'web.pid') -Force -ErrorAction SilentlyContinue
Show-Message ("Startup failed. Check the logs under:`n" + (Join-Path $runDir 'logs'))
exit 1
