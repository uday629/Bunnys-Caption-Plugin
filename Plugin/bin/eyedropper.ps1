# Bunnys Caption screen eyedropper.
# Freezes the desktop (all monitors) in a full-screen window, so any pixel can be picked: the Program
# Monitor, other apps, a second screen. A magnifier next to the cursor shows the pixels and the colour.
# Prints "move #RRGGBB" while the mouse moves and "pick #RRGGBB" on left click.
# Right click or Esc closes without picking. Arrow keys move the cursor one pixel.
# The colour is the average of a 3x3 pixel area (video noise and compression make single pixels jumpy).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BcDpi {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][BcDpi]::SetProcessDPIAware()

$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $vs.Width, $vs.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($vs.Left, $vs.Top, 0, 0, $bmp.Size)
$g.Dispose()

function Get-Rgb([int]$x, [int]$y) {
    $r = 0; $gg = 0; $b = 0; $n = 0
    for ($dx = -1; $dx -le 1; $dx++) {
        for ($dy = -1; $dy -le 1; $dy++) {
            $px = $x + $dx; $py = $y + $dy
            if ($px -ge 0 -and $py -ge 0 -and $px -lt $bmp.Width -and $py -lt $bmp.Height) {
                $c = $bmp.GetPixel($px, $py); $r += $c.R; $gg += $c.G; $b += $c.B; $n++
            }
        }
    }
    if ($n -eq 0) { return [System.Drawing.Color]::Black }
    [System.Drawing.Color]::FromArgb([int]($r / $n), [int]($gg / $n), [int]($b / $n))
}
function Hex($c) { '#{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B }

$f = New-Object System.Windows.Forms.Form
$f.FormBorderStyle = 'None'
$f.StartPosition = 'Manual'
$f.Bounds = $vs
$f.TopMost = $true
$f.ShowInTaskbar = $false
$f.KeyPreview = $true
$f.BackgroundImage = $bmp
$f.BackgroundImageLayout = 'None'
$f.Cursor = [System.Windows.Forms.Cursors]::Cross
# no flicker while the magnifier moves
$f.GetType().GetProperty('DoubleBuffered', [System.Reflection.BindingFlags]'Instance,NonPublic').SetValue($f, $true, $null)

$ZOOM = 10; $CELLS = 13; $LW = $ZOOM * $CELLS; $LH = $LW + 30
$script:mx = -1; $script:my = -1; $script:last = ''; $script:col = [System.Drawing.Color]::Black
# magnifier rectangle: below right of the cursor, flipped near the screen edges
function LoupeRect([int]$x, [int]$y) {
    $lx = $x + 24; $ly = $y + 24
    if ($lx + $LW + 4 -gt $f.ClientSize.Width) { $lx = $x - 24 - $LW }
    if ($ly + $LH + 4 -gt $f.ClientSize.Height) { $ly = $y - 24 - $LH }
    New-Object System.Drawing.Rectangle $lx, $ly, $LW, $LH
}
$font = New-Object System.Drawing.Font 'Consolas', 11, ([System.Drawing.FontStyle]::Bold)
$f.Add_Paint({
    param($s, $e)
    if ($script:mx -lt 0) { return }
    $gr = $e.Graphics
    $r = LoupeRect $script:mx $script:my
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $half = [int](($CELLS - 1) / 2)
    $src = New-Object System.Drawing.Rectangle ($script:mx - $half), ($script:my - $half), $CELLS, $CELLS
    $dst = New-Object System.Drawing.Rectangle $r.X, $r.Y, $LW, $LW
    $gr.FillRectangle([System.Drawing.Brushes]::Black, $r.X - 2, $r.Y - 2, $LW + 4, $LH + 4)
    $gr.DrawImage($bmp, $dst, $src, [System.Drawing.GraphicsUnit]::Pixel)
    # centre pixel frame
    $gr.DrawRectangle([System.Drawing.Pens]::White, $r.X + $half * $ZOOM, $r.Y + $half * $ZOOM, $ZOOM, $ZOOM)
    $gr.DrawRectangle([System.Drawing.Pens]::Black, $r.X + $half * $ZOOM - 1, $r.Y + $half * $ZOOM - 1, $ZOOM + 2, $ZOOM + 2)
    # colour swatch and hex
    $sb = New-Object System.Drawing.SolidBrush $script:col
    $gr.FillRectangle($sb, $r.X + 4, $r.Y + $LW + 5, 20, 20)
    $sb.Dispose()
    $gr.DrawString((Hex $script:col), $font, [System.Drawing.Brushes]::White, $r.X + 30, $r.Y + $LW + 6)
})
function MoveTo([int]$x, [int]$y) {
    $old = if ($script:mx -ge 0) { LoupeRect $script:mx $script:my } else { $null }
    $script:mx = $x; $script:my = $y
    $script:col = Get-Rgb $x $y
    $h = Hex $script:col
    if ($h -ne $script:last) { $script:last = $h; [Console]::Out.WriteLine("move $h"); [Console]::Out.Flush() }
    if ($old) { $old.Inflate(4, 4); $f.Invalidate($old) }
    $nr = LoupeRect $x $y; $nr.Inflate(4, 4); $f.Invalidate($nr)
}
$f.Add_MouseMove({ param($s, $e) MoveTo $e.X $e.Y })
$f.Add_MouseDown({
    param($s, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { [Console]::Out.WriteLine('pick ' + (Hex (Get-Rgb $e.X $e.Y))); [Console]::Out.Flush() }
    $f.Close()
})
$f.Add_KeyDown({
    param($s, $e)
    if ($e.KeyCode -eq 'Escape') { $f.Close(); return }
    if ($e.KeyCode -eq 'Return' -and $script:mx -ge 0) { [Console]::Out.WriteLine('pick ' + (Hex $script:col)); [Console]::Out.Flush(); $f.Close(); return }
    $d = @{ Left = @(-1, 0); Right = @(1, 0); Up = @(0, -1); Down = @(0, 1) }[[string]$e.KeyCode]
    if ($d) {
        $p = [System.Windows.Forms.Cursor]::Position
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point ($p.X + $d[0]), ($p.Y + $d[1])
        $e.Handled = $true
    }
})
$f.Add_Shown({
    $f.Activate()
    $p = $f.PointToClient([System.Windows.Forms.Cursor]::Position)
    MoveTo $p.X $p.Y
})
if ($env:BC_EYEDROP_TEST) {
    # self test: report the colour at the centre and close
    $t = New-Object System.Windows.Forms.Timer; $t.Interval = [Math]::Max(400, [int]$env:BC_EYEDROP_TEST)
    $t.Add_Tick({ [Console]::Out.WriteLine('pick ' + (Hex $script:col)); $f.Close() })
    $f.Add_Shown({ MoveTo ([int]($vs.Width / 2)) ([int]($vs.Height / 2)) })
    $t.Start()
}
[System.Windows.Forms.Application]::Run($f)
$font.Dispose()
$bmp.Dispose()
