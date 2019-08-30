// app/routes/index.js
// all root directory routes

// imports
const express = require("express");
const router = express.Router();

// libs
const dbHandlers = require("../libs/dbHandlers");

// TODO: add oauth middleware too all routes

//----------------------------------------------
//------------------ HELPERS -------------------
//----------------------------------------------
async function handleSettingsPost() {

}

//----------------------------------------------
//------------------ ROUTES --------------------
//----------------------------------------------

// get all existing table entries and pass them to index page
router.get("/", async function(req, res) {
  const params = {
    PageTitle: "HOME"
  };

  const [err, data] = await dbHandlers.scanTable();

  if (err) params.Error = err.msg;
  if (data && data.Items) params.ExistingItems = data.Items;

  res.render("index.ejs", params);
});

router.post("/", function(req, res) {
  res.redirect("index.ejs");
});

router.get("/settings", async function(req, res) {
  const params = {
    PageTitle: "SETTINGS"
  };

  res.render("settings.ejs", params);
});


// export router
module.exports = router;