# AI生成：Open VSX 自动发布脚本（支持 Token 参数；编译、打包、发布）
[CmdletBinding()]
param(
  [string]$Token
)

$ErrorActionPreference = 'Stop'

$scriptPath = $MyInvocation.MyCommand.Path
Write-Host ("Script path: {0}" -f $scriptPath)
$root = [System.IO.Path]::GetDirectoryName($scriptPath)
Set-Location $root
Write-Host ("Working directory: {0}" -f (Get-Location))

$resolvedToken = if ($Token) { $Token } elseif ($env:OVSX_ACCESS_TOKEN) { $env:OVSX_ACCESS_TOKEN } else { $null }
if (-not $resolvedToken) {
  Write-Error "Missing PAT: provide -Token '<PAT>' or set env OVSX_ACCESS_TOKEN."
}

Write-Host "Installing dependencies..."
npm install

Write-Host "Compiling extension..."
npm run compile

Write-Host "Publishing to Open VSX..."
npx --yes ovsx publish -p $resolvedToken

Write-Host "Publish completed"
