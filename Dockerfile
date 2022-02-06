FROM node:12-slim

RUN apt-get update \
    && apt-get upgrade \
    && apt-get install -y git

RUN git clone https://github.com/alwyn974/EpitechIntranetProjectUpdateNotifier

WORKDIR /EpitechIntranetProjectUpdateNotifier

RUN npm install

CMD npm start
