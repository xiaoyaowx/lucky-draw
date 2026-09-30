#Requires -Version 5.1
<#
.SYNOPSIS
    Lucky Draw 服务管理：后台启动 / 停止 / 重启 / 查看状态。

.DESCRIPTION
    把服务作为独立后台进程拉起，关掉启动窗口不会影响它，不需要留一个 cmd 挂在那里。

    几个刻意的取舍：

    * 用 `taskkill /T` 杀进程树，而不是 Stop-Process。
      `npm run start` 实际会派生 npm.cmd -> node(cross-env) -> node(tsx) -> node(server)
      一整条链，我们拿到的 PID 只是链头。只杀链头会在后台留下一个还占着端口的孤儿进程，
      下次启动就会莫名其妙地「端口被占用」。

    * 启动脚本里写死 NODE_ENV 而不是依赖 npm script 的 cross-env，
      是为了让 dev/prod 两种模式共用同一套启动/停止逻辑。

    * 就绪判定靠读日志里的 `> Ready on http://host:port`。
      这样即使 3000 被别的程序占了、server.ts 自动改用了 3001，报告出来的也是真实端口。

.NOTES
    本文件含中文，必须保存为 **带 BOM 的 UTF-8**。
    Windows PowerShell 5.1 读取无 BOM 的 UTF-8 会按 ANSI 解释，中文全变成「?」。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\service.ps1 start
    powershell -ExecutionPolicy Bypass -File scripts\service.ps1 status
    powershell -ExecutionPolicy Bypass -File scripts\service.ps1 restart -Mode dev
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status')]
    [string]$Action = 'status',

    # prod = 跑构建产物（npm run start）；dev = 热更新（npm run dev）
    [ValidateSet('prod', 'dev')]
    [string]$Mode = 'prod',

    # 监听端口，未占用时生效
    [int]$Port = 3000,

    # prod 模式下强制重新构建
    [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'

$Root      = Split-Path -Parent $PSScriptRoot
$LogDir    = Join-Path $Root 'logs'
$StateFile = Join-Path $LogDir 'service.json'
$OutLog    = Join-Path $LogDir 'server.log'
$ErrLog    = Join-Path $LogDir 'server.err.log'

# ── 基础工具 ──────────────────────────────────────────────────────────

function Write-Step  { param([string]$Text) Write-Host $Text -ForegroundColor Cyan }
function Write-Ok    { param([string]$Text) Write-Host $Text -ForegroundColor Green }
function Write-Warn  { param([string]$Text) Write-Host $Text -ForegroundColor Yellow }
function Write-Fail  { param([string]$Text) Write-Host $Text -ForegroundColor Red }

function Get-ServiceState {
    if (-not (Test-Path $StateFile)) { return $null }
    try {
        return Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        # 状态文件损坏时直接当作「没有在运行」，并由调用方清理掉
        return $null
    }
}

function Save-ServiceState {
    param([int]$ProcessId, [string]$ProcessName, [int]$ListenPort, [string]$RunMode)
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    [ordered]@{
        pid         = $ProcessId
        processName = $ProcessName
        port        = $ListenPort
        mode        = $RunMode
        startedAt   = (Get-Date).ToString('o')
    } | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
}

function Remove-ServiceState {
    if (Test-Path $StateFile) { Remove-Item $StateFile -Force -ErrorAction SilentlyContinue }
}

function Test-ProcessRunning {
    param([int]$ProcessId)
    if (-not $ProcessId) { return $false }
    try {
        $null = Get-Process -Id $ProcessId -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Stop-ProcessTree {
    param([int]$ProcessId)
    # /T 连子进程一起杀，/F 强制。退出码 128 表示进程已经不存在，不算失败。
    & taskkill.exe /PID $ProcessId /T /F | Out-Null
}

function Read-LogText {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return '' }
    try {
        # 显式指定 UTF8：PS 5.1 默认按 ANSI 读，中文日志会乱码
        return (Get-Content $Path -Raw -Encoding UTF8 -ErrorAction Stop)
    } catch {
        # 文件正被写入时可能短暂占用，等下一轮轮询再试
        return ''
    }
}

function Show-LogTail {
    param([string]$Path, [int]$Lines = 20)
    if (-not (Test-Path $Path)) { return }
    Write-Host "---- $Path ----" -ForegroundColor DarkGray
    Get-Content $Path -Encoding UTF8 -Tail $Lines | ForEach-Object { Write-Host $_ }
}

<#
    等待服务就绪。
    同时盯着两件事：日志里出现 Ready 行（成功），或进程已经退出（失败且不必等满超时）。
#>
function Wait-ForReady {
    param([int]$ProcessId, [int]$TimeoutSec)

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-ProcessRunning -ProcessId $ProcessId)) { return 0 }

        $text = Read-LogText -Path $OutLog
        if ($text -match 'Ready on https?://[^:]+:(\d+)') {
            return [int]$Matches[1]
        }
        Start-Sleep -Milliseconds 500
    }
    return 0
}

function Get-RunningService {
    $state = Get-ServiceState
    if (-not $state) { return $null }
    if (-not (Test-ProcessRunning -ProcessId $state.pid)) {
        # 进程已经不在了，清掉陈旧状态，免得后面误判成「正在运行」
        Remove-ServiceState
        return $null
    }
    return $state
}

# ── 动作 ──────────────────────────────────────────────────────────────

function Invoke-Start {
    $running = Get-RunningService
    if ($running) {
        Write-Warn "服务已在运行：PID $($running.pid)，端口 $($running.port)（$($running.mode) 模式）"
        Write-Host "如需重启请执行 restart。"
        return
    }

    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

    if ($Mode -eq 'prod') {
        $buildId = Join-Path $Root '.next\BUILD_ID'
        if ($Rebuild -or -not (Test-Path $buildId)) {
            Write-Step '正在构建生产版本（首次启动或强制重建，通常需要 1-2 分钟）...'
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) {
                Write-Fail '构建失败，已中止启动。'
                exit 1
            }
        }
    }

    $npmScript = if ($Mode -eq 'prod') { 'start' } else { 'dev' }
    Write-Step "正在启动服务（$Mode 模式，端口 $Port）..."

    # 子进程继承当前会话的环境变量，所以在这里设 PORT 即可
    $env:PORT = [string]$Port

    $proc = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run', $npmScript `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog

    # dev 模式首次编译较慢，给足时间
    $timeout = if ($Mode -eq 'dev') { 180 } else { 90 }
    $listenPort = Wait-ForReady -ProcessId $proc.Id -TimeoutSec $timeout

    if (-not $listenPort) {
        Write-Fail '启动失败或超时。日志末尾：'
        Show-LogTail -Path $OutLog
        Show-LogTail -Path $ErrLog
        if (Test-ProcessRunning -ProcessId $proc.Id) { Stop-ProcessTree -ProcessId $proc.Id }
        Remove-ServiceState
        exit 1
    }

    Save-ServiceState -ProcessId $proc.Id -ProcessName $proc.ProcessName -ListenPort $listenPort -RunMode $Mode

    Write-Ok "启动成功。"
    Write-Host "  展示屏    http://localhost:$listenPort/"
    Write-Host "  控制台    http://localhost:$listenPort/control"
    Write-Host "  管理后台  http://localhost:$listenPort/admin"
    Write-Host "  签到页    http://localhost:$listenPort/register"
    Write-Host "  PID $($proc.Id)    日志 logs\server.log"
    Write-Host '可以关闭本窗口，服务在后台继续运行。'
}

function Invoke-Stop {
    $state = Get-ServiceState
    if (-not $state) {
        Write-Warn '服务未在运行。'
        return
    }

    if (-not (Test-ProcessRunning -ProcessId $state.pid)) {
        Remove-ServiceState
        Write-Warn '服务未在运行（已清理残留的状态文件）。'
        return
    }

    Write-Step "正在停止服务（PID $($state.pid)）..."
    Stop-ProcessTree -ProcessId $state.pid

    # 等端口真正释放，避免紧接着 restart 时新进程绑不上端口
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline -and (Test-ProcessRunning -ProcessId $state.pid)) {
        Start-Sleep -Milliseconds 300
    }

    Remove-ServiceState

    if (Test-ProcessRunning -ProcessId $state.pid) {
        Write-Fail "进程 $($state.pid) 仍未退出，请手动检查。"
        exit 1
    }
    Write-Ok '服务已停止。'
}

<#
    重启。
    没显式指定 -Mode / -Port 时沿用上一次运行的模式和端口：双击 restart.bat 的人
    多半只是想「把它重启一下」，不该因为参数默认值是 prod:3000 就悄悄把开发模式
    换成生产模式、或者把服务从自定义端口挪回 3000。
#>
function Invoke-Restart {
    param([bool]$KeepPreviousMode, [bool]$KeepPreviousPort)

    $state = Get-ServiceState
    $previousMode = if ($state) { [string]$state.mode } else { '' }
    $previousPort = if ($state) { [int]$state.port } else { 0 }

    Invoke-Stop

    if ($KeepPreviousMode -and ($previousMode -eq 'prod' -or $previousMode -eq 'dev')) {
        $script:Mode = $previousMode
    }
    if ($KeepPreviousPort -and $previousPort -gt 0) {
        $script:Port = $previousPort
    }
    Invoke-Start
}

function Invoke-Status {
    $state = Get-ServiceState
    if (-not $state) {
        Write-Warn '服务未在运行。'
        return
    }
    if (-not (Test-ProcessRunning -ProcessId $state.pid)) {
        Remove-ServiceState
        Write-Warn '服务未在运行（已清理残留的状态文件）。'
        return
    }

    $startedAt = [datetime]::Parse($state.startedAt)
    $uptime = (Get-Date) - $startedAt

    Write-Ok '服务运行中。'
    Write-Host "  访问地址  http://localhost:$($state.port)/"
    Write-Host "  PID       $($state.pid)"
    Write-Host "  模式      $($state.mode)"
    Write-Host "  启动于    $($startedAt.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host ("  已运行    {0} 小时 {1} 分" -f [int]$uptime.TotalHours, $uptime.Minutes)
    Write-Host "  日志      logs\server.log"
}

# ── 入口 ──────────────────────────────────────────────────────────────

# 记录 -Mode / -Port 是不是调用方显式给的，restart 要靠它决定是否沿用旧取值
$modeExplicit = $PSBoundParameters.ContainsKey('Mode')
$portExplicit = $PSBoundParameters.ContainsKey('Port')

switch ($Action) {
    'start'   { Invoke-Start }
    'stop'    { Invoke-Stop }
    'restart' {
        Invoke-Restart -KeepPreviousMode:(-not $modeExplicit) -KeepPreviousPort:(-not $portExplicit)
    }
    'status'  { Invoke-Status }
}
