# Lists visible top-level windows of After Effects and saves an image of each (PrintWindow), so hidden dialogs can be seen.
param([string]$out = "E:\Claude Desktop\Bunnys Caption Lyrics Build\aewin")
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class AW {
  public delegate bool CB(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(CB c, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static List<string> List(uint[] pids) {
    var res = new List<string>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (Array.IndexOf(pids, p) >= 0 && IsWindowVisible(h)) {
        var t = new StringBuilder(256); GetWindowText(h, t, 256);
        var c = new StringBuilder(256); GetClassName(h, c, 256);
        RECT r; GetWindowRect(h, out r);
        res.Add(h.ToInt64() + "|" + p + "|" + c + "|" + t + "|" + (r.R - r.L) + "x" + (r.B - r.T));
      }
      return true; }, IntPtr.Zero);
    return res;
  }
}
"@
New-Item -ItemType Directory -Force $out | Out-Null
$pids = [uint32[]](Get-Process AfterFX -EA SilentlyContinue | ForEach-Object { $_.Id })
$i = 0
foreach ($w in [AW]::List($pids)) {
    $w
    $parts = $w.Split('|'); $h = [IntPtr][int64]$parts[0]
    $r = New-Object AW+RECT; [AW]::GetWindowRect($h, [ref]$r) | Out-Null
    $wd = $r.R - $r.L; $ht = $r.B - $r.T
    if ($wd -lt 50 -or $ht -lt 30 -or $wd -gt 2000) { continue }
    $bmp = New-Object System.Drawing.Bitmap $wd, $ht
    $g = [System.Drawing.Graphics]::FromImage($bmp); $dc = $g.GetHdc()
    [AW]::PrintWindow($h, $dc, 2) | Out-Null
    $g.ReleaseHdc($dc); $bmp.Save("$out\win$i.png"); $i++
}
