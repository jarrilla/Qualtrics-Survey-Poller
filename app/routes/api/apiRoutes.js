// @ts-check

// api/routes.js
// all API routes

// setup different if in debug
const IS_DEBUG = (process.env.NODE_ENV == "debug");

// imports
const
express       = require("express"),
nodeSchedule  = require("node-schedule"),
router        = express.Router();

// libs
const
fmt           = require("../../libs/format"),
dbHandlers    = require("../../libs/dbHandlers"),
qualtricsApi  = require("../../libs/qualtricsApiHandlers"),
twilioApi     = require("../../libs/twilioApiHandlers");

//------------------ GLOBAL VARS ---------------
// keep a map of all timeouts currently being tracked
// keys: survey_id; vals: Interval
const INTERVAL_MAP = new Map();
//----------------------------------------------


// GLOBALS that are infrequently updated so we store in memory

// { number }
// delay between interval triggers: default=10 minutes
// TODO: load this from a DB value on server start?
let INTERVAL_DELAY; // (10 minutes)

// { boolean }
//  if true, use node-schedule to only poll inside settings.RESTRICTED_SCHEDULE
let IS_SCHEDULE_RESTRICTED;

// start and end times for when twilio is allowed to send SMS
// init: loads {Start, End}
const RESTRICTED_SCHEDULE = {};

// { boolean }
//  if set to true, if a survey is inactive when polling, untrack it & remove it
let REMOVE_INACTIVE;

// { [boolean] }
// schedule of when tracking is allowed
// init function will fill from DB o/w default value is never allowed
// Monday=0, Tuesday=1, etc...
let ALLOWED_DAYS;

// { boolean }
// if FALSE, no polling is done on that day
// managed by node-schedule according to settings.ALLOWED_DAYS
let IS_TODAY_ALLOWED;

// rewards for completing surveys
// the last index of each is used for when more than 8 surveys are completed
// so surveys past 8 reward $0 => total is still $28
const PER_SURVEY_REWARD = ["1", "1.50", "2", "2.50", "3", "4", "6", "8", "0"];
const TOTAL_REWARD = ["1", "2.50", "4.50", "7", "10", "14", "20", "28", "28"];
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

  await addLatestResponseToNewSurvey(survey_id);
  
  if (INTERVAL_MAP.has(survey_id) === false) {
    INTERVAL_MAP.set(survey_id, setInterval(pollSurveyResponses, INTERVAL_DELAY, survey_id));
  }

  return fmt.packSuccess(db_res);
}

async function addLatestResponseToNewSurvey(survey_id) {
  try {
    const [err, res] = await getLatestSurveyResponse(survey_id);
    if (err) return [err];
    if (!res) return fmt.packSuccess(false);

    const latest_response_time = new Date(res.values.endDate);
    const [db_err, db_res] = await dbHandlers.updateLastRecordedResponseTime(survey_id, latest_response_time, false);
    if (db_err) return [err];
    if (!db_res) return fmt.packSuccess(false);

    return fmt.packSuccess(true);
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error adding latest response to new survey tracker.");
  }
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
  }
  INTERVAL_MAP.delete(survey_id);

  return fmt.packSuccess(null);
}

/**
 * TODO: reset recorded responses at the start of every day (the specific time can be a user setting?)
 * @param {string} survey_id Qualtrics survey ID
 */
async function pollSurveyResponses(survey_id) {
  try {
    // untrack inactive if user setting set to true
    if (REMOVE_INACTIVE === true) {
      const [e1,r1] = await qualtricsApi.getSurveyInfo(survey_id);
      if (e1) return [e1];

      const is_active = Boolean(r1.result.isActive);
      if (!is_active) {
        untrackSurvey(survey_id);
        return;
      }

      // TODO: (emit to browser??)
    }

    const [api_res, db_res] = [
      await getLatestSurveyResponse(survey_id),
      await dbHandlers.getLastRecordedResponseTime(survey_id)
    ];

    const [api_err, api_data] = api_res;
    const [db_err, db_data] = db_res;

    if (api_err) return [api_err];
    if (db_err) return [db_err];

    // no responses yet, do nothing || no_db entry anymore
    if (!api_data || !db_data) return;

    // determine if we're going to update db object
    let do_update = false;
    const latest = new Date(api_data.values.endDate);
    const last = db_data.Item.last_recorded_response_time ? new Date(db_data.Item.last_recorded_response_time) : null;
    if (last == null || latest > last) do_update = true;

    // proceed to update
    if (do_update) {
      const [update_err, update_res] = await dbHandlers.updateLastRecordedResponseTime(survey_id, latest, true);
      if (update_err) return [update_err];

      // get number of logged responses from db result
      const num_logged_responses = Number(update_res.Attributes.responses_today);

      // send progress SMS
      const [msg_err, ] = await sendProgressMessage(num_logged_responses, db_data.Item.subject_tel);
      if (msg_err) return [msg_err];
    }
  }
  catch (e) {
    fmt.packError(e, "Unepected error polling survey.");
  }
}


/**
 * Send a progress message to the specified phone number
 * @param {number} total_responses number of recorder responses today
 */
async function sendProgressMessage(total_responses, subject_tel) {
  // function should not have been called with 0 responses, exit
  if (total_responses == 0) return;

  // which index to use from rewards arrays
  const reward_arrays_index = (total_responses <= 8) ? total_responses-1 : 8;

  // arary index for next survey
  // if we haven't logged 8 reponses yet, next survey will be worth more, otherwise it'll be worth 0
  const next_reward_arrays_index = (reward_arrays_index < 8) ? reward_arrays_index+1 : reward_arrays_index;

  // message to send
  let msg;
  if (total_responses < 8) {
    msg = `You earned $${PER_SURVEY_REWARD[reward_arrays_index]} for this survey. `
        + `Total earned today is $${TOTAL_REWARD[reward_arrays_index]}. `
        + `If this isn't your last survey, next one is worth $${PER_SURVEY_REWARD[next_reward_arrays_index]}.`;
  }
  else if (total_responses == 8) {
    msg = `You earned $${PER_SURVEY_REWARD[reward_arrays_index]} for this survey. `
        + `Total earned today is $${TOTAL_REWARD[reward_arrays_index]}. Congratulations!`;
  }
  else {
    msg = `You have already responded to 8 surveys today.`;
  }

  // now, send the message
  try {
    const [msg_err, ] = await twilioApi.sendMessage(msg, subject_tel);
    if (msg_err) return [msg_err];

    return fmt.packSuccess(null);
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error sending twilio message.");
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

    if (!file_id) return fmt.packError(Error(`Invalid fileId for survey ${survey_id} and progressId ${progress_id}`), "Error reading fileId.");

    // finally, we poll the file for data
    const [e3, export_file] = await qualtricsApi.getResponseExportFile(survey_id, file_id);
    if (e3) return [e3];
    const responses = export_file.responses;
    const latest_response = responses.length ? responses[ responses.length-1 ] : null;

    // done
    return fmt.packSuccess(latest_response);
}

/**
 * Update every active interval with the new delay
 * @param {number} new_delay the new delay (ms)
 */
function updateIntervalDelay(new_delay) {
  INTERVAL_DELAY = new_delay;

  const survey_ids = [];
  INTERVAL_MAP.forEach((v,k) => {
    clearInterval(v);
    survey_ids.push(k);
  });

  // @ts-ignore
  QueueSurveyIdsForTracking(survey_ids);
}

async function updateAppSettings(bulk_settings) {
  // sanitize polling interval
  let { PollInterval } = bulk_settings;
  if (PollInterval < 5) {
    PollInterval = 5;
    bulk_settings.PollInterval = 5;
  }

  const [db_err, ] = await dbHandlers.updateStoredSettings(bulk_settings);
  if (db_err) return [db_err];

  updateIntervalDelay(PollInterval * 60 * 1000);

  return fmt.packSuccess(null);
}

/**
 * Uniformly distribute polling intervals throughout INTERVAL_DELAY
 * so Qualtrics API is less likely to bounce requests
 * 
 * @param {[string]} surveIdsArr array of Qualtrics Survey Ids
 */
function QueueSurveyIdsForTracking(surveIdsArr) {

  const m = INTERVAL_MAP;
  const _set_interval = sid => {
    if (m.has(sid) === false) {
      m.set(sid, setInterval(pollSurveyResponses, INTERVAL_DELAY, sid));
    }
  };

  const num_items = surveIdsArr.length;
  const uniform_delay = Math.ceil( INTERVAL_DELAY / num_items );
  for (let i=0; i < num_items; i++) {
    setTimeout( _set_interval, uniform_delay*(i+1), surveIdsArr[i] );
  }
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

async function init_loadSettings() {
  console.assert(!IS_DEBUG, "Loading settings...");

  const [sett_err, sett_data] = await dbHandlers.readStoredSettings();
  if (sett_err) return [sett_err]

  if (sett_data) {
    const settings = sett_data.Item;

    REMOVE_INACTIVE = settings.remove_inactive;
    INTERVAL_DELAY = settings.poll_interval * 60 * 1000; // stored as (min) we want (ms)
    ALLOWED_DAYS = settings.allowed_days;
    IS_SCHEDULE_RESTRICTED = settings.is_schedule_restricted;
    RESTRICTED_SCHEDULE.Start = settings.restricted_schedule[0];
    RESTRICTED_SCHEDULE.End = settings.restricted_schedule[1];
  }
  else {
    REMOVE_INACTIVE = true;
    INTERVAL_DELAY = 10*60*1000;
    ALLOWED_DAYS = Array(7).fill(false);
    IS_SCHEDULE_RESTRICTED = false;
    RESTRICTED_SCHEDULE.Start = "08:00";
    RESTRICTED_SCHEDULE.End = "23:00";
  }
  if (IS_DEBUG) INTERVAL_DELAY = 30*1000; // 1 minute if debugging

  return fmt.packSuccess(null);
}

async function init_trackExistingSurveys() {
  console.assert(!IS_DEBUG, "Tracking existing surveys...");

  const [db_err, db_data] = await dbHandlers.scanTable();
  if (db_err) return [db_err];

  const survey_ids = db_data.Items.map(x => x.survey_id);
  QueueSurveyIdsForTracking(survey_ids);

  return fmt.packSuccess(null);
}

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

/**
 * initialize tracking of surveys already in data-table. called once when server starts
 */
(async function () {
  await init_runCritical( init_loadSettings, 1 );
  await init_runCritical( init_trackExistingSurveys, 2 );

  console.log(`App running on port ${process.env.PORT}...`);
})();

module.exports = router;