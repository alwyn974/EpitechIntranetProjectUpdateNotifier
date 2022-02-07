const fs = require("fs");
const pdfParser = require("pdf-parse");
const {spawn} = require("child_process");
const {logger, error} = require("./logger");

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
 * Execute diff command and return the value of stdout
 * @param old_path the old path of the file
 * @param new_path the new path of the file
 * @returns {Promise<string>} the diff
 */
const diffFile = async (old_path, new_path) => {
    let child = spawn("diff", [old_path, new_path]);
    if (!child.pid)
        throw Error("Can't use diff command");
    let stdout;
    stdout = await new Promise((resolve => {
        child.stdout.on('data', (data) => resolve(data.toString()));
    }));
    child.stderr.on('data', (data) => {
        logger.error("Error when executing diff command %s", data.toString());
        throw data
    })
    return stdout;
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
    return await diffFile(oldTextPath, newTextPath);
}

module.exports = {
    diffPdf
}