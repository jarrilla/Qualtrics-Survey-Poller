// api/routes.js
// all API routes

// imports
const axios = require("axios");
const express = require("express");
const router = express.Router();

// libs
const fmt = require("../../libs/fmt");
const dbHandlers = require("../../libs/dbHandlers");
const qualtricsApi = require("../../libs/qualtricsApiHandlers");

//------------------ GLOBAL VARS ---------------
//----------------------------------------------

// keep a map of all timeouts currently being tracked
// keys: survey_id; vals: Interval
const INTERVAL_MAP = new Map();

// delay between interval triggers: default=10 minutes
// TODO: load this from a DB value on server start?
let INTERVAL_DELAY = 10*60*1000;



// TODO
// set up middleware

//------------- QUALTRICS API HELPERS ----------
//----------------------------------------------

// ping qualtrics for a survey
// returns the survey name if successful
async function getSurveyInfo(survey_id) {
  try {
    const res = await axios.get(`https://cmu.ca1.qualtrics.com/API/v3/surveys/${survey_id}`, QUALTRICS_API_PARAMS());
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

/**
 * Begin tracking a survey's responses.
 * Assumes survey_id is valid.
 * @param {string} survey_id Qualtrics survey ID
 */
function trackSurvey(survey_id) {
  INTERVAL_MAP.set(survey_id, setInterval(pollSurveyResponses, INTERVAL_DELAY, survey_id));
}

/**
 * TODO: clear interval & unset entry from global map
 * @param {string} survey_id Qualtrics survey ID
 */
async function untrackSurvey(survey_id) {
  // TODO: remove entry from DB
  // if succeeded, clear interval

  const interval = INTERVAL_MAP.get(survey_id);
  if (interval) clearInterval(interval);
  return true;
}

/**
 * TODO: poll survey responses to determine how many responses the subject has submitted that day
 * this should be re-set every day when a message is sent out with the previous day's progress
 * @param {string} survey_id Qualtrics survey ID
 */
async function pollSurveyResponses(survey_id) {
  try {
    // TODO:
    // - check db for last response we logged
    // - check qualtrics api for latest response
    // if latest response != last logged => log response & #responses-today +1

    const [api_res, db_res] = [
      await getLatestSurveyResponse(survey_id),
      await dbHandlers.getLatestResponseTime(survey_id)
    ];
    
    // TODO: finish
  }
  catch (e) {
    fmt.packError(e, "Unepected error polling survey.");
  }
}

/**
 * Get a survey's latest response.
 * @param {string} survey_id Qualtrics survey ID
 */
async function getLatestSurveyResponse(survey_id) {
    // first, we post the export request
    const [e1, export_req] = await qualtricsApi.createResponseExport(survey_id);
    if (e1) return e1;
    const progress_id = export_request_res.results.progressId;

    // next we poll the progress until it's 100%=
    const [e2, export_prog] = await qualtricsApi.getResponseExportProgress(survey_id, progress_id);
    if (e2) return e2;
    const file_id = export_prog.result.fileId;

    // finally, we poll the file for data
    const [e3, export_file] = await qualtricsApi.getResponseExportFile(survey_id, file_id);
    if (e3) return e3;
    const latest_response = export_file[0];


    return latest_response;
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

  // TODO: move this to track survey function call

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