# ln-prism

A typescript implementation of [Lightning Prisms](https://dergigi.com/2023/03/12/lightning-prisms/)

![prism diagram](https://dergigi.com/assets/images/bitcoin/2023-03-12-lightning-prisms/lightning-prism.png)

## Running with docker

```bash
docker run --rm -it \
	--name ln-prism
	-p 3000:3000 \
	-v $(pwd)/data:/data \
	-e DB_PATH=/data/splits.json \
	-e LNBITS_URL="https://legend.lnbits.com" \
	-e LNBITS_ADMIN_KEY="<lnbits admin key>" \
	-e LOGIN_USER=admin \
	-e LOGIN_PASSWORD=changeme \
	ghcr.io/hzrd149/ln-prism
```

Then you can open [http://localhost:3000/admin](http://localhost:3000/admin)

## Running from source

[NodeJS](https://nodejs.org/en) and [yarn](https://yarnpkg.com/) are required to build and run the app

If you dont have either installing via [nvm](https://github.com/nvm-sh/nvm) is probably the easiest way to set them up

```bash
git clone https://github.com/hzrd149/ln-prism.git
cd ln-prism
# install dependencies
yarn install
yarn build
# copy the example config
cp .env.example .env
# edit the config
nano .env
# start the dev server
yarn dev
```

Start the tunnel using `yarn tunnel` then start the dev server using `yarn dev`

## Configuration

All configuration is done through environment variables

- `DB_PATH` the path to the json file where data will be stored (default `./splits.json`)
- `PORT` http server port (default `3000`)
- `LNBITS_URL` URL to the lnbits instance ( this can be a local address, eg `http://192.168.1.100:8000` or `http://umbrel.local:3007` )
- `LNBITS_ADMIN_KEY` The admin key for the wallet, used to create and pay invoices
- `LOGIN_USER` The username for the `/admin` dashboard (default `admin`)
- `LOGIN_PASSWORD` The password for the `/admin` (if its not set then the `/admin` routes will be publicly accessible)

## Public access

For the lightning addresses and the LNURL endpoints to work the app needs to be publicly accessible and served over https

## Docker compose

See the [docker-compose.yaml](./docker-compose.yaml) for an example
