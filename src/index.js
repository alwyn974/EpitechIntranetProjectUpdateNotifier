const {logger, error} = require("./logger");
const fs = require("fs");
const {RawIntra, RawProjectFile, RawProject} = require("epitech.js");
const {PuppeteerAuthProvider} = require("@epitech.js/puppeteer-auth-provider")
let config = require("../config.json");
const {Webhook, MessageBuilder} = require("discord-webhook-node");
const pkg = require("../package.json");
const {diffPdf} = require("./diff");

let intraFetcher = new RawIntra({
    provider: new PuppeteerAuthProvider({
        storageFilePath: "./storage.json",
        verbose: config.debug
    }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
});
const interval = config.interval_of_check || 30 * 60 * 1000;
let hook = null;
if (config.useWebhook) {
    hook = new Webhook(config.webhook);
    hook.setAvatar("https://www.epitech.eu/wp-content/uploads/2020/03/cropped-favicon-epitech-150x150.png");
    hook.setUsername("Epitech Intranet");
}

/**
 * Send webhook message
 * @param data the data to send
 * @param type type of data
 * @returns {Promise<void>}
 */
const useWebhook = async (data, type = "send") => {
    if (!config.useWebhook)
        return;
    if (type === "send")
        await hook.send(data);
    else if (type === "sendFile")
        await hook.sendFile(data);
}

/**
 * Write in file
 * @param path the path
 * @param data the data to write
 * @returns {Promise<boolean>}
 */
const writeInFile = async (path, data) => {
    return new Promise((resolve) => {
        fs.writeFile(path, JSON.stringify(data, null, 2), async (err) => {
            let written = true;
            if (err) {
                error(err);
                written = false;
            }
            resolve(written);
        });
    }).then(written => written);
}

/**
 * Checking if intranet access is valid
 * @returns {Promise<void>}
 */
const checkIntranetAccess = async () => {
    try {
        await intraFetcher.getDashboard();
    } catch (e) {
        logger.error("Error when requesting to https://intra.epitech.eu : [%s]", e.message);
        logger.error("Update your token. If it's not working please open an issue");
        process.exit(1);
    }

    intraFetcher.getRequestProvider().getClient().interceptors.request.use((conf) => {
        if (config.debug)
            logger.info("[URL-DEBUG] %s%s", conf.baseURL, conf.url);
        return conf;
    });
}

/**
 * Download file from url
 * @param url
 * @param path
 * @returns {Promise<unknown>}
 */
const downloadFile = async (url, path) => {
    let res = await intraFetcher.downloadFile(path);
    if (res !== undefined)
        logger.info("File downloaded %s", path);
    else
        logger.error("Error when downloading file %s", path);
}

/**
 * Return an array of json object containing project files information
 * @param projectFiles the project files
 * @param project the project
 * @returns {Promise<unknown>}
 */
const retrieveFiles = async (projectFiles, project) => {
    let files = [];
    for (let projectFile of projectFiles) {
        if (config.downloadFile) {
            project.title = project.title.replace(/\//g, "-");
            if (!fs.existsSync(`./subjects/${project.codemodule}`)) fs.mkdirSync(`./subjects/${project.codemodule}`);
            if (!fs.existsSync(`./subjects/${project.codemodule}/${project.title}`)) fs.mkdirSync(`./subjects/${project.codemodule}/${project.title}`);
            await downloadFile(`https://intra.epitech.eu${projectFile.fullpath}`, `./subjects/${project.codemodule}/${project.title}/${projectFile.title}`);
        }
        files.push({
            title: projectFile.title,
            size: projectFile.size,
            ctime: projectFile.ctime,
            mtime: projectFile.mtime,
            path: `./subjects/${project.codemodule}/${project.title}/${projectFile.title}`
        });
    }
    return files;
}

/**
 * Return an array of json object containing project information
 * @param projet
 * @returns {Promise<{value: boolean, files: RawProjectFile[], project: RawProject, value: boolean}>}
 */
const fetchProjectFiles = async (projet) => {
    let project = await intraFetcher.getProjectByUrl(projet.title_link);
    let projectFiles = [];
    try {
        projectFiles = await intraFetcher.getProjectFiles({
            scolaryear: project.scolaryear,
            module: project.codemodule,
            instance: project.codeinstance,
            activity: project.codeacti,
        });
    } catch (e) {
        logger.warning("Can't get file of project %s-%s. Error: %s", project.codemodule, project.title, e.message);
        return {value: false, files: projectFiles, project: project};
    }

    if (Object.keys(projectFiles).length === 0) {
        logger.warning("No file for project %s-%s", project.codemodule, project.title);
        return {value: false, files: projectFiles, project: project};
    }

    let newProjectFiles = [];
    for (let projectFile of projectFiles) {
        if (projectFile.type === 'd') {
            let newUrl = intraFetcher.solveUrl(projectFile.fullpath);
            let subProjectFileRequest = await intraFetcher.getRequestProvider().get(newUrl + "/");
            let subProjectFiles = subProjectFileRequest.data;

            for (let subProjectFile of subProjectFiles) {
                if (subProjectFile.message) {
                    logger.warning("Can't get file of project %s-%s. Error: %s", project.codemodule, project.title, subProjectFile.message);
                    return {value: false, files: newProjectFiles, project: project};
                }
                if (Object.keys(subProjectFile).length === 0) {
                    logger.warning("No file for project %s-%s", project.codemodule, project.title);
                    return {value: false, files: newProjectFiles, project: project};
                }
                newProjectFiles.push(subProjectFile)
            }

        } else
            newProjectFiles.push(projectFile)
    }
    return {value: true, files: newProjectFiles, project: project};
}

/**
 * Setup project.json
 * @param dashboard the dashboard
 * @returns {Promise<void>}
 */
const setupProjectJson = async (dashboard) => {
    logger.info("projects.json doesn't exist, creating it");
    let projects = [];
    for (let projet of dashboard.board.projets) {
        let projectInformations = await fetchProjectFiles(projet);
        if (!projectInformations.value)
            continue;

        let files = await retrieveFiles(projectInformations.files, projectInformations.project);
        projects.push({
            title: projectInformations.project.title, files: files
        });
        await writeInFile("./projects.json", projects);
        logger.info("Saving files of project: %s - %s", projectInformations.project.codemodule, projectInformations.project.title);
    }
}

/**
 * Check the diff between two pdf file
 * @param savedFile the json containning the file
 * @param file the json from the intranet
 * @param project the project from the intranet
 * @returns {Promise<void>}
 */
const checkDiffWithPdf = async (savedFile, file, project) => {
    let oldPath = savedFile.path.replace(".pdf", ".old.pdf");
    logger.info("Checking diff between %s and %s", savedFile.path, oldPath);
    fs.renameSync(savedFile.path, oldPath);
    await downloadFile(`https://intra.epitech.eu${file.fullpath}`, savedFile.path);
    let diffContent = await diffPdf(oldPath, savedFile.path);

    if (diffContent.length === 0) {
        let message = new MessageBuilder()
            .setTitle("Diff between subject")
            .setDescription("No difference between old and new file")
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter(`${pkg.name} - ${pkg.version}`);
        await useWebhook(message);
        logger.info("%s-%s | No difference between old and new file", project.codemodule, file.title);
        fs.rmSync(oldPath);
        return;
    } else if (diffContent.length > 2000) {
        let diffPath = savedFile.path + ".diff.txt";
        fs.writeFileSync(diffPath, diffContent);
        await useWebhook(diffPath, "sendFile");
        logger.info("%s-%s | Difference of 2k+ characters has been found see the file %s", project.codemodule, file.title, diffPath);
    } else {
        await useWebhook("**Difference between old and new file:**\n```" + diffContent + "```");
        logger.info("%s-%s | Difference between old and new file:\n%s", project.codemodule, file.title, diffContent);
    }
    await useWebhook(oldPath, "sendFile");
    fs.rmSync(oldPath);
}

/**
 * Check if files of a project has been modified
 * @returns Promise<void>
 */
const notifier = async () => {
    if (config.downloadFile && !fs.existsSync("./subjects/"))
        fs.mkdirSync("./subjects/");
    let dashboard = await intraFetcher.getDashboard();
    if (!fs.existsSync("./projects.json") || Object.keys(require("../projects.json")).length === 0)
        await setupProjectJson(dashboard);
    else {
        let projects = require("../projects.json");
        for (let projet of dashboard.board.projets) {
            let projectInformations = await fetchProjectFiles(projet);
            if (!projectInformations.value)
                continue;

            let project = projectInformations.project;
            let projectFiles = projectInformations.files;
            if (projects.some(json => json.title === projet.title.replace(/\//g, "-"))) {
                for (let file of projectFiles) {
                    let savedFile = projects.find(json => json.title === projet.title.replace(/\//g, "-")).files.find(json => json.title === file.title);
                    if (savedFile.size !== file.size || savedFile.ctime !== file.ctime || savedFile.mtime !== file.mtime) {
                        logger.info("Project file has been updated. Project [%s] File [%s] Modifier [%s]", project.title, file.title, file.modifier.title);
                        logger.info("Size %s - Old %s | CTime %s - Old %s | MTime %s - Old %s", file.size, savedFile.size, file.ctime, savedFile.ctime, file.mtime, savedFile.mtime);
                        let subSize = file.size - savedFile.size;
                        let message = new MessageBuilder()
                            .setTitle("Subject update !")
                            .addField("Project:", project.title)
                            .addField("Module:", project.codemodule)
                            .addField("File:", file.title)
                            .addField("File size:", (subSize === 0 ? "File size is the same" : (subSize < 0 ? "File size has been decreased" : "File size has been increased") + ` by **${Math.abs(subSize)} bytes**`) + `\n**Old:** ${savedFile.size}\n**New:** ${file.size}`)
                            .addField("Creation Time:", `**Old:** ${savedFile.ctime}\n**New:** ${file.ctime}`)
                            .addField("Modification Time:", `**Old:** ${savedFile.mtime}\n**New:** ${file.mtime}`)
                            .addField("Modifier:", file.modifier.title)
                            .setColor(0x00FF00)
                            .setTimestamp()
                            .setFooter(`${pkg.name} - ${pkg.version}`);
                        await useWebhook(message);
                        if (config.downloadFile) {
                            if (!fs.existsSync(savedFile.path)) {
                                logger.info("File %s-%s was not downloaded before. Downloading...", project.codemodule, file.title);
                                await downloadFile(`https://intra.epitech.eu${file.fullpath}`, savedFile.path);
                            } else if (config.diffWithOldPdf && savedFile.path.endsWith(".pdf")) await checkDiffWithPdf(savedFile, file, project); else {
                                await useWebhook(savedFile.path, "sendFile");
                                await downloadFile(`https://intra.epitech.eu${file.fullpath}`, savedFile.path);
                            }
                        }
                        savedFile.size = file.size;
                        savedFile.ctime = file.ctime;
                        savedFile.mtime = file.mtime;
                    } else logger.info("Project file already exist [%s] [%s] [%s]", project.codemodule, project.title, file.title);
                }
            } else {
                let files = await retrieveFiles(projectFiles, project);
                projects.push({
                    title: project.title, files: files
                });
                logger.info("New project files added. Project: %s - %s", project.codemodule, project.title);
            }
        }
        await writeInFile("./projects.json", projects);
    }
}

/**
 * Convert ms to hours, minutes, seconds and ms
 * @param ms the milliseconds
 * @returns {string} the formated time
 */
const msToTime = (ms) => {
    let totalTime = ms;
    let seconds = (totalTime / 1000) % 60;
    let minutes = ((totalTime / (1000 * 60)) % 60);
    let hours = ((totalTime / (1000 * 60 * 60)) % 24);
    return parseInt(`${hours}`) + " hours " + parseInt(`${minutes}`) + " minutes " + parseInt(`${seconds}`) + " seconds and " + parseInt(`${totalTime % 1000}`) + " milliseconds";
}

/**
 * Just a main
 * @returns {Promise<void>}
 */
const main = async () => {
    logger.info("Starting Epitech Intranet Project Update Notifier...")
    logger.info("Checking access to intranet...");
    if (!fs.existsSync("./config.json")) {
        logger.error("Config file not found. Please create a config.json file.");
        process.exit(1);
    }
    await checkIntranetAccess();
    logger.info("Access to intranet granted.");
    logger.info(`Interval of fetching data is set to ${msToTime(interval)}`)
    await notifier();
    setInterval(async () => {
        await notifier();
    }, interval);
}

main().catch(async (err) => {
    error(err);
    await useWebhook(new MessageBuilder()
        .setTitle("Error")
        .setDescription(`${err}`)
        .setColor(0xFF0000)
        .setTimestamp()
        .setFooter(`${pkg.name} - ${pkg.version}`));
});
