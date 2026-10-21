// Samples, a few times a second, the memory of the Chrome processes
// started with one profile folder (so only the Chrome under test, never the user's own):
//   ramMB      sum of private bytes (PrivatePageCount) over those processes
//   wsMB       sum of working sets
//   gpuDedMB   GPU Process Memory \ Dedicated Usage over those processes (VRAM)
//   gpuShrMB   GPU Process Memory \ Shared Usage (system memory the GPU maps; the iGPU's "VRAM")
// One long-running PowerShell per measure, so sampling costs the same for every viewer.
// Windows only; elsewhere start() returns a sampler that records nothing.
import { spawn } from "node:child_process";

const SCRIPT = (profile) => `
$ErrorActionPreference = 'SilentlyContinue'
$profile = '${profile.replace(/'/g, "''")}'
$gpu = New-Object System.Diagnostics.PerformanceCounterCategory('GPU Process Memory')
$ids = @(); $lastScan = 0
while ($true) {
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  # The process list changes rarely (Chrome starts its children at launch): rescan every 2 s.
  if ($now - $lastScan -gt 2000) {
    $ids = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like "*$profile*" } | ForEach-Object { [int]$_.ProcessId })
    $lastScan = $now
  }
  $ram = 0; $ws = 0
  foreach ($p in (Get-Process -Id $ids)) { $ram += $p.PrivateMemorySize64; $ws += $p.WorkingSet64 }
  $ded = 0; $shr = 0
  if ($ids.Count -gt 0) {
    # One read of the whole category: every instance, both counters, in a few milliseconds.
    $data = $gpu.ReadCategory()
    foreach ($kind in @('Dedicated Usage', 'Shared Usage')) {
      $col = $data[$kind]
      if ($col) {
        foreach ($inst in $col.Values) {
          if ($inst.InstanceName -match '^pid_(\\d+)_' -and ($ids -contains [int]$Matches[1])) {
            if ($kind -eq 'Dedicated Usage') { $ded += $inst.RawValue } else { $shr += $inst.RawValue }
          }
        }
      }
    }
  }
  Write-Output ("{0},{1},{2},{3},{4},{5}" -f $now, $ids.Count, [int64]$ram, [int64]$ws, [int64]$ded, [int64]$shr)
  Start-Sleep -Milliseconds 200
}`;

const MB = 1024 * 1024;

export function startSampler(profile) {
  const samples = [];
  if (process.platform !== "win32") return { ready: Promise.resolve(), mark() {}, snapshot: () => ({ samples, marks: {} }), stop: async () => ({ samples, marks: {} }) };
  let resolveReady;
  // PowerShell takes 3 to 4 s to start: callers wait for the first sample before loading the page.
  const ready = new Promise((r) => { resolveReady = r; });
  const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", SCRIPT(profile)], { stdio: ["ignore", "pipe", "ignore"] });
  let buf = "";
  ps.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const [t, n, ram, ws, ded, shr] = line.split(",").map(Number);
      if (Number.isFinite(t)) resolveReady();
      if (Number.isFinite(t)) samples.push({ t, processes: n, ramMB: Math.round(ram / MB), wsMB: Math.round(ws / MB), gpuDedMB: Math.round(ded / MB), gpuShrMB: Math.round(shr / MB) });
    }
  });
  const marks = {};
  return {
    ready,
    // Names a moment (load start, done, path start, path end) to cut the samples into phases.
    mark(name) { marks[name] = Date.now(); },
    // The samples and marks so far, without stopping.
    snapshot() { return { samples: [...samples], marks: { ...marks } }; },
    async stop() {
      ps.kill();
      return { samples, marks };
    },
  };
}

// Peak of each measure over [from, to] (epoch ms), from the samples.
export function peaks(samples, from = -Infinity, to = Infinity) {
  const s = samples.filter((x) => x.t >= from && x.t <= to && x.processes > 0);
  if (!s.length) return undefined;
  const max = (k) => Math.max(...s.map((x) => x[k]));
  return { ramMB: max("ramMB"), wsMB: max("wsMB"), gpuDedMB: max("gpuDedMB"), gpuShrMB: max("gpuShrMB"), samples: s.length };
}
