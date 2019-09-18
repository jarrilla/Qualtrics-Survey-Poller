// @ts-check

// app.js
// TODO: document
// TODO: implement the following
// - twilio api (for sending texts) =>> receive STOP requests
// - node-schedule package (for scheduling texts)
// TODO: implement settings for:
//
// TODO: add oauth w/ qualtrics
// TODO: send invalid routes to 404 page w/ navbar

// env vars
require("dotenv").config();

// libs
const
fmt = require("./app/libs/format"),
config = require("./app/libs/config"),
qualtrics = require("./app/libs/qualtricsApiHandlers");

// includes
const express = require("express");
const bodyParser = require("body-parser");

// setup express
const app = express();
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

// routes
const indexRoutes = require("./app/routes/index");
const apiRoutes = require("./app/routes/api/apiRoutes");
app.use("/", indexRoutes);
app.use("/api", apiRoutes);

// listen
app.listen(process.env.PORT);

//----------------------------------------------
//------------------- INIT ---------------------
//----------------------------------------------

/**
 * Run a critical init function
 * @param {function} func 
 * @param {number} exitCode 
 * @param  {...any} args 
 */
async function init_runCritical(func, exitCode, ...args) {
  const [err, data] = await func(...args);
  if (err) {
    console.error(err);
    process.exit(exitCode);
  }

  return fmt.packSuccess(data);
}

(async function () {
  await init_runCritical( config.init, 1 );
  await init_runCritical( qualtrics.init, 2 );

  console.log(`App running on port ${process.env.PORT}...`);
})();