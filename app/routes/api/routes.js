// api/routes.js
// all API routes

// imports
const axios = require("axios");
const express = require("express");
const router = express.Router();

// libs
const dbHandlers = require("../../libs/dbHandlers");

// TODO
// set up middleware

//------------- QUALTRICS API HELPERS ----------
//----------------------------------------------

// qualtrics api headers
const QUALTRICS_API_CONFIG = { headers: { "X-API-TOKEN": process.env.QUALTRICS_API_KEY } };

// ping qualtrics for a survey
// returns the survey name if successful
async function getSurveyInfo(survey_id) {
  try {
    const res = await axios.get(`https://cmu.ca1.qualtrics.com/API/v3/surveys/${survey_id}`, QUALTRICS_API_CONFIG);
    const { name } = res.data.result;

    return [null, name];
  }
  catch (e) {
    const { status } = e.response;
    const resp_msg = (status == 404) ? "Survey not found." : "Unknown error. Please try again.";

    // TODO: log error to DB

    return [{
      status: status,
      message: resp_msg
    }];
  }
}

//------------------ ROUTES --------------------
//----------------------------------------------

// Create survey tracker table
router.post("/createTable", async function(req, res){
  const [db_err, ] = dbHandlers.createTable();
  if (db_err) res.status(500).send();
  else res.status(200).send();
});

// attempt to track a new survey
// If survey doesn't exist, returns 404
// If DB insert fails, returns 500
// TODO: does not handle edits
router.post("/trackSurvey", async function(req, res) {
  //SV_dnEGQcB3RAcAVW5
  const { SurveyId, SubjectTel, SubjectId } = req.body;

  const [api_err, survey_name] = await getSurveyInfo(SurveyId);
  if (api_err) res.status(api_err.status).send({error:api_err.message});
  else {
    // survey exists, add entry to database table
    const [db_err, ] = await dbHandlers.putItem(survey_name, SurveyId, SubjectTel, SubjectId);
    if (db_err) res.status(500).send({error:"Unknown error. Please try again."});
    else res.status(200).send(survey_name);
  }
});

module.exports = router;