param(
    [switch]$RequireGpu,
    [int]$MinFreeGb = 30,
    [string]$TargetRoot = "C:\YoloApp"
)

$ErrorActionPreference = "Stop"

function Test-Command($Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-Result($Level, $Item, $Message) {
    [pscustomobject]@{
        Level   = $Level
        Item    = $Item
        Message = $Message
    }
}

$results = @()
$fatalCount = 0

if (-not $IsWindows) {
    $results += Add-Result "ERROR" "OperatingSystem" "Windows is required for the packaged desktop workflow."
    $fatalCount++
} else {
    $results += Add-Result "OK" "OperatingSystem" "$([System.Environment]::OSVersion.VersionString)"
}

if ([Environment]::Is64BitOperatingSystem) {
    $results += Add-Result "OK" "Architecture" "64-bit OS detected."
} else {
    $results += Add-Result "ERROR" "Architecture" "64-bit Windows is required."
    $fatalCount++
}

$driveRoot = [System.IO.Path]::GetPathRoot($TargetRoot)
$drive = Get-PSDrive -Name $driveRoot.TrimEnd('\').TrimEnd(':') -ErrorAction SilentlyContinue
if ($null -eq $drive) {
    $results += Add-Result "WARN" "Disk" "Cannot resolve drive for $TargetRoot."
} else {
    $freeGb = [math]::Round($drive.Free / 1GB, 2)
    if ($freeGb -lt $MinFreeGb) {
        $results += Add-Result "ERROR" "Disk" "Free space on $driveRoot is ${freeGb}GB, below required ${MinFreeGb}GB."
        $fatalCount++
    } else {
        $results += Add-Result "OK" "Disk" "Free space on $driveRoot is ${freeGb}GB."
    }
}

if (-not (Test-Command "docker")) {
    $results += Add-Result "ERROR" "DockerCLI" "Docker is not installed or not in PATH."
    $fatalCount++
} else {
    try {
        docker info | Out-Null
        $results += Add-Result "OK" "DockerEngine" "Docker engine is running."
    } catch {
        $results += Add-Result "ERROR" "DockerEngine" "Docker is installed but engine is not reachable."
        $fatalCount++
    }
}

if (Test-Command "wsl") {
    try {
        $wslList = wsl -l -q 2>$null
        if ($wslList) {
            $results += Add-Result "OK" "WSL" "WSL is available."
        } else {
            $results += Add-Result "WARN" "WSL" "WSL command exists but no distributions are listed."
        }
    } catch {
        $results += Add-Result "WARN" "WSL" "WSL check failed."
    }
} else {
    $results += Add-Result "WARN" "WSL" "WSL is not available in PATH."
}

if (Test-Command "node")) {
    try {
        $nodeVersion = node -v
        $results += Add-Result "OK" "Node" "Node.js $nodeVersion"
    } catch {
        $results += Add-Result "WARN" "Node" "Node.js exists but version check failed."
    }
} else {
    $results += Add-Result "WARN" "Node" "Node.js not found. This is acceptable if only running the packaged exe."
}

if ($RequireGpu) {
    if (-not (Test-Command "nvidia-smi")) {
        $results += Add-Result "ERROR" "GPU" "GPU delivery requested but nvidia-smi is not available."
        $fatalCount++
    } else {
        try {
            $gpuName = (nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1).Trim()
            if ($gpuName) {
                $results += Add-Result "OK" "GPU" "Detected GPU: $gpuName"
            } else {
                $results += Add-Result "ERROR" "GPU" "nvidia-smi returned no GPU name."
                $fatalCount++
            }
        } catch {
            $results += Add-Result "ERROR" "GPU" "nvidia-smi check failed."
            $fatalCount++
        }
    }
} elseif (Test-Command "nvidia-smi") {
    try {
        $gpuName = (nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1).Trim()
        if ($gpuName) {
            $results += Add-Result "OK" "GPU" "Detected GPU: $gpuName"
        }
    } catch {
        $results += Add-Result "WARN" "GPU" "GPU exists but could not be queried."
    }
}

$results | Format-Table Level, Item, Message -AutoSize

if ($fatalCount -gt 0) {
    Write-Error "Preflight check failed with $fatalCount blocking issue(s)."
    exit 1
}

Write-Host "Preflight check passed."
