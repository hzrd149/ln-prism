import nconf from "nconf";

nconf.argv().env();

// if (nconf.get("config")) {
//   nconf.file({ path: nconf.get("config") });
// }

nconf.defaults({
  lnbitsUrl: "https://example.com",
});

console.log(nconf.get("lnbitsUrl"));
