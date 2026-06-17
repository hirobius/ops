#Requires -RunAsAdministrator
param(
    [int]$Port = 3000,
    [string]$Distro = ""   # Optional: set to your WSL distro name, e.g. "Ubuntu"
)

$ErrorActionPreference = "Stop"

function Get-WSLIPAddress {
    param([string]$DistroName)

    $wslArgs = @()
    if ($DistroName) {
        $wslArgs += @("-d", $DistroName)
    }

    # hostname -I returns all IPs for the distro; use the first one
    $output = (& wsl.exe @wslArgs hostname -I | Out-String).Trim()
    if (-not $output) {
        throw "Could not read a WSL IP. Make sure the distro is running."
    }

    $ip = ($output -split '\s+')[0]
    if ($ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
        throw "Unexpected WSL IP output: $output"
    }

    return $ip
}

function Get-TailscaleIP {
    if (Get-Command tailscale.exe -ErrorAction SilentlyContinue) {
        $ts = (& tailscale.exe ip -4 | Out-String).Trim()
        if ($ts) { return ($ts -split '\s+')[0] }
    }

    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -like 'Tailscale*' } |
        Select-Object -First 1 -ExpandProperty IPAddress

    return $ip
}

$listenAddress = "0.0.0.0"
$ruleName = "WSL2 Port $Port"

$wslIp = Get-WSLIPAddress -DistroName $Distro
Write-Host "WSL2 IP: $wslIp"

# Remove any existing portproxy rule for this port, then add the current one
& netsh interface portproxy delete v4tov4 listenaddress=$listenAddress listenport=$Port | Out-Null
& netsh interface portproxy add v4tov4 listenaddress=$listenAddress listenport=$Port connectaddress=$wslIp connectport=$Port

# Replace any existing firewall rule with the same name
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Any | Out-Null

$tailscaleIp = Get-TailscaleIP
if ($tailscaleIp) {
    Write-Host "Tailscale IP: $tailscaleIp"
    Write-Host "Open this on your iPad: http://$tailscaleIp`:$Port"
} else {
    Write-Warning "Could not determine the Tailscale IP automatically. Run: tailscale ip -4"
}
