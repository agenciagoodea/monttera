<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

$zipFile = __DIR__ . '/deploy-bundle.zip';
$extractTo = __DIR__;

echo "Iniciando descompactação...\n";
echo "Arquivo: " . $zipFile . " (" . (file_exists($zipFile) ? 'Existe' : 'Não existe') . ")\n";
echo "Destino: " . $extractTo . "\n";

if (!file_exists($zipFile)) {
    exit("Erro: Arquivo zip não encontrado.");
}

$zip = new ZipArchive;
$res = $zip->open($zipFile);
if ($res === TRUE) {
    if ($zip->extractTo($extractTo)) {
        echo "✅ Extração concluída com sucesso!\n";
    } else {
        echo "❌ Falha ao extrair arquivos.\n";
    }
    $zip->close();
} else {
    exit("❌ Erro ao abrir o zip. Código: " . $res);
}
