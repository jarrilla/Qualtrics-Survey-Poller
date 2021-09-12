// @ts-check

// app.js
// TODO: document
// TODO: implement the following
// - twilio api (for sending texts) => receive STOP requests ?
// - cronjobs instead of intervals for API polling
// - qualtrics API load balancer

// env vars
require("dotenv").config();

// run initializers
require('./config/app.config');
require('./providers/dynamo.repository');
require('./providers/qualtrics.service');
require('./providers/twilio.service');

// includes
const express = require("express");
const cors = require('cors');

// setup express
const app = express();
app.use( express.json() );
app.use( express.urlencoded({ extended: true }) );
app.use( cors() );
app.use( '/api', require('./app.controller') );

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App running on port ${PORT}`));