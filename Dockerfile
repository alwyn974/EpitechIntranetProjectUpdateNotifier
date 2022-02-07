FROM node:14-slim

RUN apt-get update \
    && apt-get upgrade \
    && apt-get install -y git diffutils

RUN git clone https://github.com/alwyn974/EpitechIntranetProjectUpdateNotifier

WORKDIR /EpitechIntranetProjectUpdateNotifier

RUN npm install

CMD npm start
