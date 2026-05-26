Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("D:\www\digitalbordados\digitalbordados-migracao-limpo-20260520-125945.zip")
$entries = $zip.Entries
$groups = $entries | Group-Object { 
    $parts = $_.FullName -split '/'
    if ($parts.Length -gt 1) {
        return "digitalbordados/" + $parts[1]
    } else {
        return $parts[0]
    }
} | Select-Object Name, Count
$groups | Format-Table -AutoSize
$zip.Dispose()
