import shell from "shelljs";
import "dotenv/config.js";

shell.exec("./node_modules/.bin/tsc");
shell.exec("./node_modules/.bin/tsc --watch", { silent: true, async: true });
shell.exec("./node_modules/.bin/nodemon --watch build -d 1 build/index.js", {
  async: true,
});
