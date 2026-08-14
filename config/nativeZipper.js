async function backupWithoutNpm(targetFolder, outputZipPath) {
    console.log(`[DEBUG] Đang quét thư mục: ${targetFolder}`);
    
    if (!fs.existsSync(targetFolder)) {
        throw new Error(`Không tìm thấy thư mục: ${targetFolder}`);
    }

    const files = fs.readdirSync(targetFolder);
    let backupData = {};
    let count = 0;

    for (const file of files) {
        if (file.endsWith('.json') && file !== 'package.json' && file !== 'package-lock.json') {
            const filePath = path.join(targetFolder, file);
            console.log(`[DEBUG] Đã tìm thấy file: ${file}`); // Xem log này trong console
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                backupData[file] = JSON.parse(content);
                count++;
            } catch (e) {
                console.error(`[DEBUG] Lỗi đọc file ${file}:`, e.message);
            }
        }
    }

    console.log(`[DEBUG] Tổng số file JSON tìm thấy: ${count}`);
    if (count === 0) throw new Error("Không tìm thấy file JSON nào trong thư mục!");

    // ... (phần ghi file và nén giữ nguyên như cũ)
    const tempJsonPath = outputZipPath.replace('.zip', '_temp.json');
    fs.writeFileSync(tempJsonPath, JSON.stringify(backupData, null, 4));
    await compressToZipNative(tempJsonPath, outputZipPath);
    if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
    
    return outputZipPath;
}
