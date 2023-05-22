FROM node:18-alpine

EXPOSE 3000

WORKDIR /app
COPY . /app/

RUN yarn install
RUN yarn build

ENV DB_PATH=/data/splits.json

ENTRYPOINT [ "node", "build/index.js" ]
