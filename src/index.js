const readLine = require("readline");
const {logger, error} = require("./logger");
const fs = require("fs");
const {RawIntra} = require("epitech.js");
let config = require("../config.json");
const {Webhook, MessageBuilder} = require("discord-webhook-node");
const pkg = require("../package.json");

const rl = readLine.createInterface({
    input: process.stdin,
    output: process.stdout
})

const autologinIntranet = "https://intra.epitech.eu/admin/autolog";
let intraFetcher = null;
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
 * Checking if autologin link is valid
 * @param autologin the link
 * @returns {Promise<void>}
 */
const checkAutoLogin = async (autologin) => {
    let regex = new RegExp("https://intra.epitech.eu/auth-[a-f0-9]{40}")
    if (!regex.test(autologin)) {
        logger.error("Autologin is not valid, please retry with a good autologin link");
        logger.error("Change it directly in config.json. If you're autologin is already saved");
        process.exit(1);
    }
    intraFetcher = new RawIntra({
        autologin: autologin
    })

    let dashboard = await intraFetcher.getDashboard(); //simple request to see if autologin link is working
    if (!dashboard) {
        logger.error("Can't fetch any data with this autologin link");
        process.exit(1);
    } else if (dashboard.message) {
        logger.error("Error when requesting to https://intra.epitech.eu : [%s]", dashboard.message);
        logger.error("Update your autologin token. If it's not working please open an issue");
        process.exit(1);
    }
    logger.info("Link is valid");
    intraFetcher.getRequestProvider().getClient().interceptors.request.use((conf) => {
        if (config.debug)
            logger.debug("Base Url: %s | Url %s", conf.baseURL, conf.url);
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
    let response = await intraFetcher.getRequestProvider().getClient().get(url, {
        headers: {Accept: "application/octet-stream", "Content-Type": "application/octet-stream"},
        responseType: "stream"
    });
    response.data.pipe(fs.createWriteStream(path));
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
 * Check if files of a project has been modified
 * @returns Promise<void>
 */
const notifier = async () => {
    if (config.downloadFile && !fs.existsSync("./subjects/")) fs.mkdirSync("./subjects/");
    let dashboard = await intraFetcher.getDashboard();
    if (!fs.existsSync("./projects.json")) {
        logger.info("projects.json doesn't exist, creating it");
        let projects = [];
        for (let projet of dashboard.board.projets) {
            let project = await intraFetcher.getProjectByUrl(projet.title_link);
            let projectFiles = await intraFetcher.getProjectFiles({
                scolaryear: project.scolaryear,
                module: project.codemodule,
                instance: project.codeinstance,
                activity: project.codeacti,
            });
            if (projectFiles.message) {
                logger.warning("Can't get file of project %s-%s. Error: %s", project.codemodule, project.title, projectFiles.message);
                continue;
            }

            let files = await retrieveFiles(projectFiles, project);
            projects.push({
                title: project.title,
                files: files
            });
            await writeInFile("./projects.json", projects);
            logger.info("Saving files of project: %s - %s", project.codemodule, project.title);
        }
    } else {
        let projects = require("../projects.json");
        for (let projet of dashboard.board.projets) {
            let project = await intraFetcher.getProjectByUrl(projet.title_link);
            let projectFiles = await intraFetcher.getProjectFiles({
                scolaryear: project.scolaryear,
                module: project.codemodule,
                instance: project.codeinstance,
                activity: project.codeacti,
            });
            if (projectFiles.message) {
                logger.warning("Can't get file of project %s-%s. Error: %s", project.codemodule, project.title, projectFiles.message);
                continue;
            }

            if (projects.some(json => json.title === projet.title)) {
                for (let file of projectFiles) {
                    let savedFile = projects.find(json => json.title === projet.title).files.find(json => json.title === file.title);
                    if (savedFile.size !== file.size || savedFile.ctime !== file.ctime || savedFile.mtime !== file.mtime) {
                        logger.info("Project file has been updated. Project [%s] File [%s] Modifier [%s]", project.title, file.title, file.modifier.title);
                        logger.info("Size %s - Old %s | CTime %s - Old %s | MTime %s - Old %s", file.size, savedFile.size, file.ctime, savedFile.ctime, file.mtime, savedFile.mtime);
                        let message = new MessageBuilder()
                            .setTitle("Subject update !")
                            .addField("Project:", project.title)
                            .addField("Module:", project.codemodule)
                            .addField("File:", file.title)
                            .addField("File size:", (file.size - savedFile.size < 0 ? "File size has been decreased" : "File size has been increased") +
                                ` by **${Math.abs(file.size - savedFile.size)}**\n**Old:** ${savedFile.size}\n**New:** ${file.size}`)
                            .addField("Creation Time:", `**Old:** ${savedFile.ctime}\n**New:** ${file.ctime}`)
                            .addField("Modification Time:", `**Old:** ${savedFile.mtime}\n**New:** ${file.mtime}`)
                            .addField("Modifier:", file.modifier.title)
                            .setColor(0x00FF00)
                            .setTimestamp()
                            .setFooter(`${pkg.name} - ${pkg.version}`);
                        await useWebhook(message);
                        if (config.downloadFile) {
                            await useWebhook(savedFile.path, "sendFile");
                            await downloadFile(`https://intra.epitech.eu${file.fullpath}`, savedFile.path);
                        }
                        savedFile.size = file.size;
                        savedFile.ctime = file.ctime;
                        savedFile.mtime = file.mtime;
                    } else
                        logger.info("Project file already exist [%s] [%s] [%s]", project.codemodule, project.title, file.title);
                }
            } else {
                let files = await retrieveFiles(projectFiles, project);
                projects.push({
                    title: project.title,
                    files: files
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
    if (config.autologin === "") {
        await (new Promise((resolve) => {
            rl.question(`Epitech intranet auto login (${autologinIntranet}): `, async (auto_login) => {
                await checkAutoLogin(auto_login)
                logger.info("Set autologin to %s", auto_login)
                config.autologin = auto_login;
                rl.close();
                resolve();
            });
        }));
        await writeInFile(config, "./config.json");
    } else {
        logger.info("Checking saved autologin link...");
        await checkAutoLogin(config.autologin);
    }
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
        .setFooter(`${pkg.name} - ${pkg.version}`)
    );
});
