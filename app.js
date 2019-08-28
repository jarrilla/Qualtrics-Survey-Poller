// @ts-check

// app.js
// TODO: document
// TODO: implement the following
// - twilio api (for sending texts)
// - node-schedule package (for scheduling texts)
// TODO: add settings for:
// - when to send messages
// - what should messages contain
// - automatically untrack inactive surveys
//
// TODO: load all tracker Intervals on server re-start
// 
// TODO: navigation banner ejs partial
// TODO: setup aws + dynamo freetier
// TODO: add oauth w/ qualtrics
// TODO: send invalid routes to 404 page w/ navbar

// env vars
require("dotenv").config();

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
const apiRoutes = require("./app/routes/api/routes");
app.use("/", indexRoutes);
app.use("/api", apiRoutes);

// listen
app.listen(process.env.PORT, function() {
  console.log(`App running on port ${process.env.PORT}...`);
});