const readLine = require("readline");
const {logger, error} = require("./logger");
const fs = require("fs");
const {RawIntra, RawDashboard} = require("epitech.js");
let config = require("./config.json");

const rl = readLine.createInterface({
    input: process.stdin,
    output: process.stdout
})

const autologinIntranet = "https://intra.epitech.eu/admin/autolog";
let intraFetcher = null;
let dashboard = null;
let timeBetweenCheck = null;

const writeInFile = async (path, data) => {
    return new Promise((resolve, reject) => {
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

const checkAutoLogin = async (autologin) => {
    let regex = new RegExp("https://intra.epitech.eu/auth-[a-f0-9]{40}")
    if (!regex.test(autologin)) {
        logger.error("Autologin is not valid, please retry with a good autologin link")
        process.exit(1);
    }
    intraFetcher = new RawIntra({
        autologin: autologin
    })

    dashboard = await intraFetcher.getDashboard(); //simple request to see if autologin link is working
    if (!dashboard) {
        logger.error("Can't fetch any data with this autologin link");
        process.exit(1);
    }
    logger.info("Link is valid")
}

const notifier = async () => {
    if (dashboard instanceof RawDashboard) {
        dashboard.board.projets.forEach(project => {

        })
    } else {
        logger.error("Dashboard variable is not instanceof RawDashboard");
        process.exit(1);
    }
}

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
    } else {
        logger.info("Checking saved autologin link...");
        await checkAutoLogin(config.autologin);
    }
    await notifier();
    setInterval(async () => {
        await notifier();
    }, config.time_between_check)
}

main().catch(error)