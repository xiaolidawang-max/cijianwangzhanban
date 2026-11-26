@echo off
setlocal
chcp 65001 >nul
set "CIJIAN_SITE_DIR=%~dp0"

powershell.exe -NoLogo -NoProfile -NonInteractive -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$root = $env:CIJIAN_SITE_DIR;" ^
  "$page = Join-Path $root 'vocabulary.html';" ^
  "$icon = Join-Path $root 'assets\cijian.ico';" ^
  "if (!(Test-Path -LiteralPath $page -PathType Leaf) -or !(Test-Path -LiteralPath $icon -PathType Leaf)) { throw '请先完整解压词间文件夹，再运行此脚本。' };" ^
  "$desktop = [Environment]::GetFolderPath('DesktopDirectory');" ^
  "if (!$desktop) { throw '找不到当前用户的桌面文件夹。' };" ^
  "$path = Join-Path $desktop '词间网页版.lnk';" ^
  "$description = '在浏览器中打开本地词间网页版';" ^
  "$shell = New-Object -ComObject WScript.Shell;" ^
  "$shortcut = $shell.CreateShortcut($path);" ^
  "if ($shortcut.TargetPath -and $shortcut.TargetPath -ne $page -and $shortcut.Description -ne $description) { throw '桌面已有同名快捷方式，请先给它改名。' };" ^
  "$shortcut.TargetPath = $page;" ^
  "$shortcut.WorkingDirectory = $root;" ^
  "$shortcut.IconLocation = $icon + ',0';" ^
  "$shortcut.Description = $description;" ^
  "$shortcut.Save();"

if errorlevel 1 (
  pause
  exit /b 1
)
