// @ts-check

// api/routes.js
// all API routes

// imports
const axios = require("axios");
const express = require("express");
const router = express.Router();

// libs
const fmt = require("../../libs/format");
const dbHandlers = require("../../libs/dbHandlers");
const qualtricsApi = require("../../libs/qualtricsApiHandlers");

//------------------ GLOBAL VARS ---------------
//----------------------------------------------

// keep a map of all timeouts currently being tracked
// keys: survey_id; vals: Interval
const INTERVAL_MAP = new Map();

// delay between interval triggers: default=10 minutes
// TODO: load this from a DB value on server start?
let INTERVAL_DELAY = 10*60*1000; // (10 minutes)



// TODO
// set up middleware

//------------- QUALTRICS API HELPERS ----------
//----------------------------------------------

/**
 * Begin tracking a survey's responses.
 * Assumes survey_id is valid.
 * @param {string} survey_id Qualtrics survey ID
 * @param {string} subject_tel
 * @param {string?} subject_id
 * @returns [*,string] The survey name in Qualtrics, if successful.
 */
async function trackNewSurvey(survey_id, subject_tel, subject_id) {
  // ping API to get survey name
  const [api_err, api_res] = await qualtricsApi.getSurveyInfo(survey_id);
  if (api_err) return [api_err];
  const survey_name = api_res.result.name;
  
  // put item in DB first
  // @ts-ignore
  const [db_err, db_res] = await dbHandlers.putItem(survey_name, ...arguments);
  if (db_err) return [db_err];

  INTERVAL_MAP.set(survey_id, setInterval(pollSurveyResponses, INTERVAL_DELAY, survey_id));

  return fmt.packSuccess(db_res);
}

/**
 * TODO: clear interval & unset entry from global map
 * @param {string} survey_id Qualtrics survey ID
 */
async function untrackSurvey(survey_id) {
  const [db_err, ] = await dbHandlers.removeItem(survey_id);
  if (db_err) return [db_err];

  const interval = INTERVAL_MAP.get(survey_id);
  if (interval) clearInterval(interval);

  return fmt.packSuccess(null);
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
      await dbHandlers.getLastRecordedResponseTime(survey_id)
    ];

    const [api_err, api_data] = api_res;
    const [db_err, db_data] = db_res;

    if (api_err) return [api_err];
    if (db_err) return [db_err];

    // no responses yet, do nothing
    if (!api_data) return;

    // determine if we're going to update db object
    let do_update = false;
    const latest = new Date(api_data.values.endDate);
    const last = db_data.Item.last_recorded_response_time ? new Date(db_data.Item.last_recorded_response_time) : null;
    if (last == null || latest > last) do_update = true;

    // proceed to update
    if (do_update) {
      const [update_err, ] = await dbHandlers.updateLastRecordedResponseTime(survey_id, latest);
      if (update_err) return [update_err];

      // TODO:
      // a new response was recorded send text:
      
      // TODO: add user setting for what message to send
    }
  }
  catch (e) {
    fmt.packError(e, "Unepected error polling survey.");
  }
}

/**
 * Get a survey's latest response.
 * TODO: fix this
 * @param {string} survey_id Qualtrics survey ID
 */
async function getLatestSurveyResponse(survey_id) {
    // first, we post the export request
    const [e1, export_req] = await qualtricsApi.createResponseExport(survey_id);
    if (e1) return [e1];
    //console.log(export_req);
    const progress_id = export_req.result.progressId;

    // next we poll the progress until it's 100%
    const [e2, export_prog] = await qualtricsApi.getResponseExportProgress(survey_id, progress_id);
    if (e2) return [e2];
    const file_id = export_prog.result.fileId;

    // finally, we poll the file for data
    const [e3, export_file] = await qualtricsApi.getResponseExportFile(survey_id, file_id);
    if (e3) return [e3];
    const responses = export_file.responses;
    const latest_response = responses.length ? responses[0] : null;

    // done
    return fmt.packSuccess(latest_response);
}

//----------------------------------------------
//------------------ ROUTES --------------------
//----------------------------------------------

// Create survey tracker table
router.post("/createTable", async function(req, res){
  const [db_err, ] = await dbHandlers.createTable();
  if (db_err) res.status(500).send();
  else res.status(200).send();
});

// attempt to track a new survey
// If survey doesn't exist, returns 404
// If DB insert fails, returns 500
//
// TODO: check if survey_id already exists, and ask user if they want to overwrite
router.post("/trackSurvey", async function(req, res) {
  
  const { SurveyId, SubjectTel, SubjectId } = req.body;

  const [queue_err, queue_res] = await trackNewSurvey(SurveyId, SubjectTel, SubjectId);
  if (queue_err) res.status(queue_err.status_code).send({error:queue_err.msg});
  else res.status(200).send(queue_res);

});

/**
 * Untrack a survey if it exists.
 */
router.post("/untrackSurvey", async function(req, res) {
  const { SurveyId } = req.body;

  const [error, ] = await untrackSurvey(SurveyId);
  if (error) res.status(error.status_code).send({error:error.msg});
  else res.status(200).send();
});

//----------------------------------------------
//------------------- INIT ---------------------
//----------------------------------------------

/**
 * initialize tracking of surveys already in data-table. called once when server starts
 */
(async function _initTracking_() {
  try {
    const [db_err, db_data] = await dbHandlers.scanTable();
    if (db_err) return [db_err];

    for (let i=0; i < db_data.Items; i++) {
      const survey_id = db_data.Items[i].survey_id;
      INTERVAL_MAP.set(survey_id, setInterval(pollSurveyResponses, INTERVAL_DELAY, survey_id));
    }

  }
  catch (e) {

  }
})();

module.exports = router;