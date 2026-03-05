$ErrorActionPreference = "Stop"

$tools = "C:\Users\laboratorio\Downloads\ROBO\tools"
$javaHome = Join-Path $tools "jdk-17.0.18+8"
$jar = "C:\Users\laboratorio\Downloads\ROBO\robo novo\target\arb-hft-engine-1.0.0.jar"

if (-not (Test-Path $jar)) {
  Write-Host "JAR não encontrado. Rode o build primeiro."
  exit 1
}

$env:JAVA_HOME = $javaHome
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host "Iniciando backend em http://localhost:8080 ..."
java -jar $jar
