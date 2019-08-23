// app/routes/index.js
// all root directory routes

// imports
const express = require("express");
const router = express.Router();

// libs
const dbHandlers = require("../libs/dbHandlers");

// TODO: add oauth middleware too all routes

// get all existing table entries and pass them to index page
router.get("/", async function(req, res) {
  const data = await dbHandlers.scanTable();
  const table_items = data[1].Items;

  const params = {
    ExistingItems: table_items
  };

  res.render("index.ejs", params);
});

router.post("/", function(req, res) {
  res.redirect("index.ejs");
});


// export router
module.exports = router;