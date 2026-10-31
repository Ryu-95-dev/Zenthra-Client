# Builds the Zenthra mod for every Minecraft version in versions/*.properties and copies
# each jar (plus launcher/resources/zenthra-mod/index.json) into the launcher.
#   powershell -ExecutionPolicy Bypass -File build-all.ps1            # every version
#   powershell -ExecutionPolicy Bypass -File build-all.ps1 1.21.11    # only some
# JAVA_HOME must point to a JDK 25 (Fabric Loom runs on Java 25).
param([string[]]$Targets)

Set-Location $PSScriptRoot
if (-not $Targets) { $Targets = Get-ChildItem versions -Filter *.properties | ForEach-Object { $_.BaseName } }
$failed = @()
foreach ($t in $Targets) {
	Write-Host "== Zenthra pour Minecraft $t"
	& .\gradlew.bat build "-Ptarget=$t" --console=plain
	if ($LASTEXITCODE -ne 0) { $failed += $t }
}
if ($failed) {
	Write-Host "Échec de compilation : $($failed -join ', ')"
	exit 1
}
Write-Host "Compilé : $($Targets -join ', ')"
