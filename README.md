# EpitechIntranetProjectUpdateNotifier

A useful nodejs program to send notification on discord when a project file is updated

## Install

You need to clone/download this project, and then you need to run `npm install`

You can use the `install-service.sh` script to install the project (clone + setup of a service)

```bash
curl -LO https://raw.githubusercontent.com/alwyn974/EpitechIntranetProjectUpdateNotifier/main/install-service.sh && chmod +x install-service.sh
```

### Docker

You can use `docker-compose up -d` to start the docker

If you want to see the logs `docker attach epitechintranetprojectupdatenotifier` or run only `docker-compose up`

See the `docker-compose.yml`

## Usage

You need to specify the discord webhook link in the `config.json`.

Then you can use `npm start` to run the program. <br>
You will need to connect to your Epitech account. (Graphically, then the refresh will be headless)

#### ⚠️ A file named `storage.json` will be created. Don't share this file with anyone

When you are connected the notifier with check every **30 minutes** (configurable in the `config.json`) if a file is updated on current projects.

### ⚠️ Warning

To use the diff feature, you need to have the `diff` command installed on your system. (already installed on most linux distros, and on the docker)

## Tips

- You can login into the app (graphically on linux/windows), and then copy the `storage.json` file to your headless machine

## Troubleshooting

- Any error with puppeteer => Check the troubleshooting page of puppeteer
https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md


> :bulb: Don't forget to put a star on the project to support the project
