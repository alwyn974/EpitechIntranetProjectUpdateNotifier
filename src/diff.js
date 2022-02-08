const fs = require("fs");
const pdfParser = require("pdf-parse");
const {spawnSync} = require("child_process");

/**
 * Transform pdf file to text
 * @param path the file
 * @returns {Promise<string>} the text
 */
const pdfToText = async (path) => {
    const dataBuffer = await fs.readFileSync(path);
    const data = await pdfParser(dataBuffer);
    return data.text;
}

/**
 * Return the diff between to pdf text
 * @param old_path the old pdf path
 * @param new_path the new pdf path
 * @returns {Promise<string>} the diff between the two pdfs text
 */
const diffPdf = async (old_path, new_path) => {
    let oldText = await pdfToText(old_path);
    let newText = await pdfToText(new_path);
    let oldTextPath = old_path + ".txt";
    let newTextPath = new_path + ".txt";
    fs.writeFileSync(oldTextPath, oldText);
    fs.writeFileSync(newTextPath, newText);
    let diff = spawnSync("diff", [oldTextPath, newTextPath]);
    return diff.stdout.toString();
}

module.exports = {
    diffPdf
}