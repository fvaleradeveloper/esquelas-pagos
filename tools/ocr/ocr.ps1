# OCR helper using the Windows.Media.Ocr engine (offline, no external deps).
# Usage: powershell -ExecutionPolicy Bypass -File tools\ocr\ocr.ps1 -Path <file> [-Mode raw|gray|bin]
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [ValidateSet('raw', 'gray', 'bin')][string]$Mode = 'raw',
    [double]$Scale = 3.0,
    [int]$Threshold = 160,
    [int]$X = 0,
    [int]$Y = 0,
    [int]$W = 0,
    [int]$H = 0,
    [switch]$RawOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]

function Await-Op($op, $type) {
    $m = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
        Select-Object -First 1
    $t = $m.MakeGenericMethod($type).Invoke($null, @($op))
    $t.Wait()
    $t.Result
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()

function Invoke-OcrFile([string]$file) {
    $f = Await-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($file)) ([Windows.Storage.StorageFile])
    $stream = Await-Op ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-Op ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await-Op ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    return $res
}

# --- Preprocess into a temp PNG ---
$src = [System.Drawing.Image]::FromFile($Path)
if ($W -le 0) { $W = $src.Width }
if ($H -le 0) { $H = $src.Height }
$cropRect = New-Object System.Drawing.Rectangle($X, $Y, [Math]::Min($W, $src.Width - $X), [Math]::Min($H, $src.Height - $Y))
if ($cropRect.Width -le 0 -or $cropRect.Height -le 0) { throw "Invalid crop rect" }
$w = [int]($cropRect.Width * $Scale)
$h = [int]($cropRect.Height * $Scale)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$src.Dispose()

if ($Mode -ne 'raw') {
    $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $bytes = New-Object byte[] ([Math]::Abs($data.Stride) * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    for ($y = 0; $y -lt $h; $y++) {
        $rowStart = $y * $data.Stride
        for ($x = 0; $x -lt $w; $x++) {
            $i = $rowStart + $x * 3
            $b = $bytes[$i]; $gg = $bytes[$i + 1]; $r = $bytes[$i + 2]
            $lum = [int](0.299 * $r + 0.587 * $gg + 0.114 * $b)
            if ($Mode -eq 'gray') {
                $bytes[$i] = $lum; $bytes[$i + 1] = $lum; $bytes[$i + 2] = $lum
            } else {
                $v = if ($lum -ge $Threshold) { 255 } else { 0 }
                $bytes[$i] = $v; $bytes[$i + 1] = $v; $bytes[$i + 2] = $v
            }
        }
    }
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
    $bmp.UnlockBits($data)
}

$tmp = [System.IO.Path]::GetTempFileName() + '.png'
$bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# --- OCR ---
$result = Invoke-OcrFile $tmp

if (-not $RawOnly) {
    foreach ($line in $result.Lines) {
        $words = @()
        foreach ($wrd in $line.Words) {
            $words += ('{0}[{1}x{2}]' -f $wrd.Text, [int]$wrd.BoundingRect.X, [int]$wrd.BoundingRect.Y)
        }
        Write-Output ('L| ' + ($words -join ' '))
    }
    Write-Output '=== RAW TEXT ==='
}
Write-Output $result.Text
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
