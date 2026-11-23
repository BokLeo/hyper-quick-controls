[CmdletBinding()]
param(
    [string]$HyperHome = (Join-Path $env:APPDATA 'Hyper')
)
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $HyperHome '.hyper.js'
$pluginPath = Join-Path $HyperHome '.hyper_plugins/local/hyper-quick-controls'
if (-not (Test-Path -LiteralPath $configPath)) { throw "Hyper config not found: $configPath" }
$config = [IO.File]::ReadAllText($configPath)
# Refuse unfamiliar syntax rather than reformatting or overwriting user settings.
$pattern = '(?m)^(?<indent>\s*)localPlugins\s*:\s*\[(?<items>[^\]]*)\]'
$matches = [regex]::Matches($config, $pattern)
if ($matches.Count -ne 1) { throw 'Expected exactly one localPlugins array. No changes made.' }
$match = $matches[0]
$items = $match.Groups['items'].Value
$registered = $items -match '[''"]hyper-quick-controls[''"]'
$newConfig = $config
if (-not $registered) {
    $trimmed = $items.Trim()
    $separator = if ($trimmed.Length -eq 0 -or $trimmed.EndsWith(',')) { '' } else { ',' }
    $replacement = $match.Groups['indent'].Value + 'localPlugins: [' + $trimmed + $separator + ' "hyper-quick-controls"]'
    $newConfig = $config.Substring(0, $match.Index) + $replacement + $config.Substring($match.Index + $match.Length)
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backup = "$configPath.backup-quick-controls-$stamp"
Copy-Item -LiteralPath $configPath -Destination $backup
if (Test-Path -LiteralPath $pluginPath) {
    Copy-Item -LiteralPath $pluginPath -Destination "$pluginPath.backup-$stamp" -Recurse
}
New-Item -ItemType Directory -Path $pluginPath -Force | Out-Null
foreach ($file in @('favorites.js', 'shortcuts.js', 'toolbar.js', 'package.json', 'README.md', 'LICENSE', 'ACKNOWLEDGEMENTS.md', 'index.js')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $pluginPath $file) -Force
}
if (-not $registered) {
    [IO.File]::WriteAllText($configPath, $newConfig, (New-Object Text.UTF8Encoding($false)))
}
Write-Output "Installed: $pluginPath"
Write-Output "Config backup: $backup"
Write-Output 'In Hyper: View > Full Reload (Ctrl+Shift+F5). Check running work before reloading.'
