FROM node:18-alpine

EXPOSE 3000

WORKDIR /app
COPY . /app/

ENV NODE_ENV=production
RUN yarn install
RUN yarn build

ENV DB_PATH=/data/db.json

ENTRYPOINT [ "node", "build/index.js" ]
