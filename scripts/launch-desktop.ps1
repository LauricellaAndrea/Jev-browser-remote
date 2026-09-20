param(
    [Parameter(Mandatory=$false)][string]$CommandLine = "cmd.exe /c `"C:\Users\andre\Desktop\Jev-project\AVVIA-JEV.bat`""
)

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class DefaultLauncher {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO {
        public Int32 cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public Int32 dwX;
        public Int32 dwY;
        public Int32 dwXSize;
        public Int32 dwYSize;
        public Int32 dwXCountChars;
        public Int32 dwYCountChars;
        public Int32 dwFillAttribute;
        public Int32 dwFlags;
        public Int16 wShowWindow;
        public Int16 cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public Int32 dwProcessId;
        public Int32 dwThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcess(
        string lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    public static int LaunchOnUserDesktop(string commandLine, string workDir) {
        int pid = -1;
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        if (hDesk == IntPtr.Zero) {
            return -1 * Marshal.GetLastWin32Error();
        }
        Thread t = new Thread(() => {
            bool set = SetThreadDesktop(hDesk);
            STARTUPINFO si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(si);
            si.lpDesktop = "Default";
            PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
            bool ok = CreateProcess(null, commandLine, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, workDir, ref si, out pi);
            if (ok) {
                pid = pi.dwProcessId;
            } else {
                pid = -1 * Marshal.GetLastWin32Error();
            }
        });
        t.Start();
        t.Join();
        return pid;
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'DefaultLauncher').Type) {
    Add-Type -TypeDefinition $code
}

$workDir = "C:\Users\andre\Desktop\Jev-project"
$pidResult = [DefaultLauncher]::LaunchOnUserDesktop($CommandLine, $workDir)
Write-Output $pidResult
