import { tunnelmole } from "tunnelmole";
import shell from "shelljs";

shell.exec("./node_modules/.bin/tsc");
shell.exec("./node_modules/.bin/tsc --watch", { silent: true, async: true });
shell.exec("./node_modules/.bin/nodemon --watch build node build/index.js", {
  async: true,
});

await tunnelmole({ port: 3000 });
