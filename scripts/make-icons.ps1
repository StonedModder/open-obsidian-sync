$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "assets"
New-Item -ItemType Directory -Force -Path $assets | Out-Null

function New-PngIcon($size, $path) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(17, 17, 17))

  $scale = $size / 512
  $points = @(
    [System.Drawing.PointF]::new(258 * $scale, 48 * $scale),
    [System.Drawing.PointF]::new(402 * $scale, 138 * $scale),
    [System.Drawing.PointF]::new(448 * $scale, 300 * $scale),
    [System.Drawing.PointF]::new(322 * $scale, 462 * $scale),
    [System.Drawing.PointF]::new(136 * $scale, 420 * $scale),
    [System.Drawing.PointF]::new(70 * $scale, 236 * $scale),
    [System.Drawing.PointF]::new(152 * $scale, 92 * $scale)
  )

  $pathBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.RectangleF]::new(70 * $scale, 48 * $scale, 378 * $scale, 414 * $scale),
    [System.Drawing.Color]::FromArgb(167, 139, 250),
    [System.Drawing.Color]::FromArgb(76, 29, 149),
    45
  )
  $graphics.FillPolygon($pathBrush, $points)

  $facetPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(216, 180, 254)), (5 * $scale)
  $graphics.DrawLine($facetPen, [System.Drawing.PointF]::new(152 * $scale, 92 * $scale), [System.Drawing.PointF]::new(258 * $scale, 384 * $scale))
  $graphics.DrawLine($facetPen, [System.Drawing.PointF]::new(402 * $scale, 138 * $scale), [System.Drawing.PointF]::new(210 * $scale, 246 * $scale))

  $syncPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(236, 252, 203)), (17 * $scale)
  $syncPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $syncPen.EndCap = [System.Drawing.Drawing2D.LineCap]::ArrowAnchor
  $graphics.DrawArc($syncPen, 152 * $scale, 174 * $scale, 208 * $scale, 150 * $scale, 208, 210)
  $graphics.DrawArc($syncPen, 154 * $scale, 216 * $scale, 208 * $scale, 150 * $scale, 28, 210)

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function New-IcoFromPng($pngPath, $icoPath) {
  [byte[]]$png = [System.IO.File]::ReadAllBytes($pngPath)
  $stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
  $writer = New-Object System.IO.BinaryWriter($stream)
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]1)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$png.Length)
  $writer.Write([UInt32]22)
  $writer.Write($png)
  $writer.Dispose()
  $stream.Dispose()
}

function New-IcnsFromPng($pngPath, $icnsPath) {
  [byte[]]$png = [System.IO.File]::ReadAllBytes($pngPath)
  $stream = [System.IO.File]::Open($icnsPath, [System.IO.FileMode]::Create)
  $writer = New-Object System.IO.BinaryWriter($stream)
  $totalLength = 16 + $png.Length
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("icns"))
  $writer.Write([System.BitConverter]::GetBytes([System.Net.IPAddress]::HostToNetworkOrder([int]$totalLength)))
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes("ic10"))
  $writer.Write([System.BitConverter]::GetBytes([System.Net.IPAddress]::HostToNetworkOrder([int](8 + $png.Length))))
  $writer.Write($png)
  $writer.Dispose()
  $stream.Dispose()
}

$png512 = Join-Path $assets "icon.png"
$png1024 = Join-Path $assets "icon-1024.png"

New-PngIcon 512 $png512
New-PngIcon 1024 $png1024
New-IcoFromPng $png512 (Join-Path $assets "icon.ico")
New-IcnsFromPng $png1024 (Join-Path $assets "icon.icns")

Write-Host "Icons written to $assets"
