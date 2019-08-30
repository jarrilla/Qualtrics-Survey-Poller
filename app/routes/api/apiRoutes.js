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
const twilioApi = require("../../libs/twilioApiHandlers");

//------------------ GLOBAL VARS ---------------
//----------------------------------------------

// keep a map of all timeouts currently being tracked
// keys: survey_id; vals: Interval
const INTERVAL_MAP = new Map();

//----------------------------------------------
// GLOBALS that are infrequently updated so we store in memory
//----------------------------------------------

// delay between interval triggers: default=10 minutes
// TODO: load this from a DB value on server start?
let INTERVAL_DELAY; // (10 minutes)

// (boolean) if true, send a new sms every time a new response is recorded
// uses NEW_RESPONSE_SMS_TEMPLATE
let SEND_ON_NEW_RESPONSE;

// template for sms messages sent after new responses
let NEW_RESPONSE_SMS_TEMPLATE;

// (boolean) if true, use RESTRICTED_SCHEDULE
let RESTRICT_SCHEDULE;

// start and end times for when twilio is allowed to send SMS
// init: loads {Start, End}
const RESTRICTED_SCHEDULE = {}

// (boolean) if set to true, if a survey is inactive when polling, untrack it & remove it
// TODO:
let REMOVE_INACTIVE;

// schedule of when to send progress reports
// init: fills { Days [boolean]x7, Time: }
// Monday=0, Tuesday=1, etc...
// on day marked as true, send progress report when time=Time
const PROGRESS_SCHEDULE = {}


//----------------------------------------------
//----------------------------------------------
//----------------------------------------------


// TODO
// set up middleware

//----------------------------------------------
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
  if (interval) {
    clearInterval(interval);
    INTERVAL_MAP.delete(survey_id);
  }

  return fmt.packSuccess(null);
}

/**
 * TODO: reset recorded responses at the start of every day (the specific time can be a user setting?)
 * @param {string} survey_id Qualtrics survey ID
 */
async function pollSurveyResponses(survey_id) {
  try {
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

      if (SEND_ON_NEW_RESPONSE) {
        const msg = makeMessageFromTemplate(NEW_RESPONSE_SMS_TEMPLATE, db_data.Item.subject_id);

        const [msg_err, ] = await twilioApi.sendMessage(msg, db_data.Item.subject_tel);
        if (msg_err) return [msg_err];
      }
    }
  }
  catch (e) {
    fmt.packError(e, "Unepected error polling survey.");
  }
}

/**
 * make a message from a template and optional parameters
 * TODO: add more parameters
 * @param {string} template the template to use
 * @param {string} name subject name
 */
function makeMessageFromTemplate(template, name=null) {
  let msg;
  if (template.includes("%name%")) {
    msg = template.replace("%name%", name||"");
  }
  else msg = template;

  return msg;
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

/**
 * Update every active interval with the new delay
 * @param {number} new_delay the new delay (ms)
 */
function updateIntervalDelay(new_delay) {
  INTERVAL_DELAY = new_delay;

  INTERVAL_MAP.forEach((v,k) => {
    clearInterval(v);
    v = setInterval(pollSurveyResponses, new_delay, k);
  });

}

async function updateAppSettings(bulk_settings) {
  // sanitize polling interval
  let { PollInterval } = bulk_settings;
  if (PollInterval < 10) {
    PollInterval = 10;
    bulk_settings.PollInterval = 10;
  }

  const [db_err, ] = await dbHandlers.updateStoredSettings(bulk_settings);
  if (db_err) return [db_err];

  updateIntervalDelay(PollInterval * 60 * 1000);

  return fmt.packSuccess(null);
}

//----------------------------------------------
//---------------- API CALLS -------------------
//----------------------------------------------

/**
 * Set the time between interval triggers
 */
router.post("/updateSettings", async function(req, res) {
  const [err, ] = await updateAppSettings(req.body);
  if (err) res.status(err.status_code).send({error:err.msg});
  else res.status(200).send();
})

// attempt to track a new survey
// If survey doesn't exist, returns 404
// If DB insert fails, returns 500
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
  else res.status(200).send(true);
});

//----------------------------------------------
//------------------- INIT ---------------------
//----------------------------------------------

/**
 * initialize tracking of surveys already in data-table. called once when server starts
 */
(async function _initTracking_() {
  try {
    // load settings into memory
    const [sett_err, sett_data] = await dbHandlers.readStoredSettings();
    if (sett_err) throw sett_err;

    const settings = sett_data.Item;
    INTERVAL_DELAY = settings.poll_interval * 60 * 1000; // stored as (min) we want (ms)
    SEND_ON_NEW_RESPONSE = settings.send_on_new;
    NEW_RESPONSE_SMS_TEMPLATE = settings.on_new_template;
    RESTRICT_SCHEDULE = settings.restrict_schedule;
    RESTRICTED_SCHEDULE.Start = settings.restricted_schedule[0];
    RESTRICTED_SCHEDULE.Start = settings.restricted_schedule[1];
    REMOVE_INACTIVE = settings.remove_inactive;
    PROGRESS_SCHEDULE.Days = settings.progress_schedule.Days;
    PROGRESS_SCHEDULE.Time = settings.progress_schedule.Time;


    // start tracking all existing surveys
    const [db_err, db_data] = await dbHandlers.scanTable();
    if (db_err) throw db_err;

    for (let i=0; i < db_data.Items.length; i++) {
      const survey_id = db_data.Items[i].survey_id;
      INTERVAL_MAP.set(survey_id, setInterval(pollSurveyResponses, INTERVAL_DELAY, survey_id));
    }

  }
  catch (e) {
    // TODO: queue function to run again
    console.log(e);
  }
})();

module.exports = router;