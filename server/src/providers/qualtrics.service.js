// @ts-check

// app/libs/qualtricsApiHandlers.js
// All Qualtrics API calls through axios for our app.
// -----------------------------------
// -----------------------------------
// -----------------------------------
module.exports = {
  TrackNewSurvey,
  UntrackSurvey,

  UpdateIntervalDelay,
  ResetAllSurveyCounters
};
// -----------------------------------

const axios = require("axios");
const { BackgroundServiceErrorHandler, ProviderCallWrapper, GetHoursMinutesFromTimeString24 } = require("../utils");
const { EXIT_CODES, IS_DEBUG, GetIntervalDelay, GetIsTodayAllowed, GetIsScheduleRestricted, GetRestrictedSchedule, GetRemoveInactive } = require("../config/app.config");
const { SetSurveyLatestResponseTime, AddSurvey, GetSurveys, ResetSurveyCounters, GetSurveyLatestResponseTime, RemoveSurvey } = require("./dynamo.repository");
// const ProviderError = require("./ProviderError");
const { TextProgressMessage } = require("./twilio.service");
// -----------------------------------


// GLOBALS ---------------------------

// Polling interval map
// keep a map of all timeouts currently being tracked
// keys: survey_id; vals: Interval
const INTERVAL_MAP = new Map();

// keep track of (canPollNow() result)
// when flipping from false -> true, we update the latest response time
// to effectively ignore any responses submitted while we weren't tracking
let LastPollingAllowed = false;

// (ms) time to way before polling progress exports again
const PROG_POLL_INTERVAL_DELAY=500;

// max number of attempts we'll poll an export progress completion before giving up
const MAX_PROG_POLL_ATTEMPTS=10;

// API headers
const AXIOS_CONFIG = { headers: { "X-API-TOKEN": process.env.QUALTRICS_API_KEY } };

// see qualtrics API
const HOST = "https://cmu.ca1.qualtrics.com/API/v3";
const SURVEY_URL = (survey_id) => `${HOST}/surveys/${survey_id}`;
const EXPORT_SURVEY_URL = (survey_id) => `${SURVEY_URL(survey_id)}/export-responses`;
const EXPORT_PROGRESS_URL = (survey_id, progress_id) =>  `${EXPORT_SURVEY_URL(survey_id)}/${progress_id}`;
const RESPONSE_FILE_URL = (survey_id, file_id) => `${EXPORT_SURVEY_URL(survey_id)}/${file_id}/file`;

/**
 * Initialize module.
 * Get all surveys being tracked & queue them for polling
 */
 (async function() {
  console.assert(!IS_DEBUG, "Tracking existing surveys...");

  const [db_err, db_data] = await ProviderCallWrapper( GetSurveys() );
  if (db_err) return process.exit( EXIT_CODES.QUALTRICS_INIT_FAIL );

  const survey_ids = (db_data?.Items || []).map(x => x.survey_id);
  queueSurveyIdsForPolling(survey_ids);

  return [null, null];
})();

/**
 * HELPER FUNCTION to check for export progress completion every few seconds
 * @param {Number} current_try 
 * @param {string} survey_id 
 * @param {string} progress_id 
 * @returns 
 */
async function _waitForProgressCompletion_(current_try, survey_id, progress_id) {
  const promise = new Promise(async function(resolve, reject) {
    if (++current_try == MAX_PROG_POLL_ATTEMPTS) reject("Timed out waiting for progress request.");

    // @ts-ignore
    const [err, data] = await ProviderCallWrapper( axios.get(EXPORT_PROGRESS_URL(survey_id, progress_id), AXIOS_CONFIG) );

    if (err) reject(err);  
    else if (data.result && data.result.percentComplete == 100.0) resolve(data);
    else setTimeout(async function() {
      try {
        const r = await _waitForProgressCompletion_(current_try, survey_id, progress_id);
        resolve(r);
      }
      catch (e) {
        reject(e);
      }
    }, PROG_POLL_INTERVAL_DELAY);
  });
  return promise;
}


// API wrappers ----------------------
// -----------------------------------

// Create Response Export
// https://api.qualtrics.com/reference#create-response-export-new// 
async function createResponseExport(survey_id) {
  const post_data = {
    format: "json",
    compress: false
  };
  
  // @ts-ignore
  const [err, data] = await ProviderCallWrapper( axios.post(EXPORT_SURVEY_URL(survey_id), post_data, AXIOS_CONFIG) );
  if (err) return [err];
  return [null, data];
}

// Get Survey
// https://api.qualtrics.com/reference#get-survey
// Using legacy version because it chains better with export functions.
// The information we need is displayed in both versions (surveys & survey-definitions)
async function getSurveyInfo(survey_id) {
  
  // @ts-ignore
  const [err, data] = await ProviderCallWrapper( axios.get(SURVEY_URL(survey_id), AXIOS_CONFIG) );
  if (err) return [err];
  return [null, data];
}

// Get Response Export Progress
// https://api.qualtrics.com/reference#get-response-export-progress-1
// Get the completion status of an export-progress request.
//
// Since progress is checked on an interval, we use a callback to return results.
// Will poll a few times before returning a "time-out" error if unsuccessful.
async function getResponseExportProgress(survey_id, progress_id) {
  try {
    const res = await _waitForProgressCompletion_(0, survey_id, progress_id);
    return [null, res];
  }
  catch (err) {
    return [err];
  }
}

// Get Response Export File
// https://api.qualtrics.com/reference#get-response-export-file-1
// <file_id> comes from result of an export-progress request
// Get the exported file from a previous request
async function getResponseExportFile(survey_id, file_id) {

  // @ts-ignore
  const [err, data] = await _callWrapper_( axios.get(RESPONSE_FILE_URL(survey_id, file_id), AXIOS_CONFIG) );
  if (err) return [err];
  return [null, data];
}
// -----------------------------------
// -----------------------------------


// Helper functions
// -----------------------------------
async function checkForLatestResponse(survey_id) {
  const [err, res] = await getLatestSurveyResponse(survey_id);
    if (err) return [err];
    if (!res) return [null, false];
  
  try {
    const latest_response_time = new Date(res.values.endDate);
    const [db_err, db_res] = await SetSurveyLatestResponseTime(survey_id, latest_response_time, false);
    if (db_err) return [err];
    // if (!db_res) return [null, false];

    return [null, !!db_res];
  }
  catch (e) {
    return [e];
    // return [new ServiceError(e, 500)];
  }
}

/**
 * Get a survey's latest response.
 * TODO: fix this
 * @param {string} survey_id Qualtrics survey ID
 */
async function getLatestSurveyResponse(survey_id) {
  // first, we post the export request
  const [e1, export_req] = await createResponseExport(survey_id);
  if (e1) return [e1];
  const progress_id = export_req.result.progressId;

  // next we poll the progress until it's 100%
  const [e2, export_prog] = await getResponseExportProgress(survey_id, progress_id);
  if (e2) return [e2];
  const file_id = export_prog.result.fileId;

  if (!file_id) {
    return BackgroundServiceErrorHandler(
      new Error(`Invalid file_id for survey ${survey_id} and progress_id ${progress_id}`)
    );
  }

  // finally, we poll the file for data
  const [e3, export_file] = await getResponseExportFile(survey_id, file_id);
  if (e3) return [e3];
  const responses = export_file.responses;
  const latest_response = responses.length ? responses[ responses.length-1 ] : null;

  // done
  // return fmt.packSuccess(latest_response);
  return [null, latest_response];
}

/**
 * Uniformly distribute polling intervals throughout INTERVAL_DELAY
 * so Qualtrics API is less likely to bounce requests
 * 
 * @param {[string]} surveIdsArr array of Qualtrics Survey Ids
 */
function queueSurveyIdsForPolling(surveIdsArr) {
  const delay = GetIntervalDelay();

  const m = INTERVAL_MAP;
  const _set_interval = sid => {
    if (m.has(sid) === false) {
      m.set(sid, setInterval(pollSurveyResponses, delay, sid));
    }
  };

  const num_items = surveIdsArr.length;
  const uniform_delay = Math.ceil( delay / num_items );
  for (let i=0; i < num_items; i++) {
    setTimeout( _set_interval, uniform_delay*(i+1), surveIdsArr[i] );
  }
}

function canPollNow() {
  const is_today_allowed = GetIsTodayAllowed();
  if (!is_today_allowed) return false;

  const is_schedule_restricted = GetIsScheduleRestricted();
  if (is_schedule_restricted) {
    const time_now = new Date();
    const hour_now = time_now.getHours();
    const min_now = time_now.getMinutes();

    const { Start, End } = GetRestrictedSchedule();

    const allowed_start = GetHoursMinutesFromTimeString24(Start);
    const start_hour = allowed_start.Hour;
    const start_min = allowed_start.Minute;

    // too early, can't start polling yet
    if ( hour_now < Start || (hour_now == start_hour && min_now < start_min) ) return false;

    const allowed_end = GetHoursMinutesFromTimeString24(End);
    const end_hour = allowed_end.Hour;
    const end_min  = allowed_end.Minute;

    // too late, stop polling
    if (hour_now > End || (hour_now == end_hour && min_now > end_min) ) return false;
  }

  return true;
}

/**
 * Poll a survey for responses if we're within the allowed schedule.
 * @param {string} survey_id Qualtrics survey ID
 */
async function pollSurveyResponses(survey_id) {

  // first check schedule allowance
  const can_poll_now = canPollNow();
  
  // we're about to start polling.. update latest response
  // so we ignore any responses submitted while we weren't polling
  if ( !LastPollingAllowed && can_poll_now ) {
    
    await ProviderCallWrapper( checkForLatestResponse(survey_id) );
  }

  // update polling allowed flag
  LastPollingAllowed = can_poll_now;

  // can't poll yet -> exit
  if (!can_poll_now) {
    return;
  }
  
  try {
    // untrack inactive if user setting set to true
    if (GetRemoveInactive() === true) {
      const [e1,r1] = await ProviderCallWrapper( getSurveyInfo(survey_id) );
      if (e1) [e1];

      const is_active = Boolean(r1.result.isActive);
      if (!is_active) {
        ProviderCallWrapper( UntrackSurvey(survey_id) );
        return;
      }

    }

    const [api_res, db_res] = [
      await ProviderCallWrapper( getLatestSurveyResponse(survey_id) ),
      await ProviderCallWrapper( GetSurveyLatestResponseTime(survey_id) )
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
      const [update_err, update_res] =
        await ProviderCallWrapper( SetSurveyLatestResponseTime(survey_id, latest, true) );

      if (update_err) return [update_err];

      // get number of logged responses from db result
      const num_logged_responses = Number(update_res.Attributes.responses_today);

      // send progress SMS
      const [msg_err, ] = await TextProgressMessage(num_logged_responses, db_data.Item.subject_tel);
      if (msg_err) return [msg_err];
    }
  }
  catch (e) {
    return [e];
  }
}

// -----------------------------------
// -----------------------------------


// Exported functions
// -----------------------------------

/**
 * Begin tracking a survey's responses.
 * Assumes survey_id is valid.
 * @param {string} survey_id Qualtrics survey ID
 * @param {string} subject_tel
 * @param {string?} subject_id
 * @returns [*,string] The survey name in Qualtrics, if successful.
 */
async function TrackNewSurvey(survey_id, subject_tel, subject_id) {
  // ping API to get survey name
  const [api_err, api_res] = await ProviderCallWrapper( getSurveyInfo(survey_id) );
  if (api_err) {
    api_err.details = 'Getting survey info';
    return [api_err];
  }
  const survey_name = api_res.result.name;
  
  // put item in DB first
  // @ts-ignore
  const [db_err, db_res] =
    await ProviderCallWrapper( AddSurvey(survey_name, survey_id, subject_tel, subject_id) );
  
  if (db_err) [db_err];

  await ProviderCallWrapper( checkForLatestResponse(survey_id) );
  
  if (INTERVAL_MAP.has(survey_id) === false) {
    INTERVAL_MAP.set(survey_id, setInterval(pollSurveyResponses, GetIntervalDelay(), survey_id));
  }

  return [null, db_res];
}

/**
 * Clear interval map and queue all survyes+new one to be tracked..
 */
function UpdateIntervalDelay() {
  const survey_ids = [];
  INTERVAL_MAP.forEach((v,k) => {
    clearInterval(v);
    survey_ids.push(k);
  });

  // reset interval map & rebalance trackers with new delay
  INTERVAL_MAP.clear();

  // @ts-ignore
  queueSurveyIdsForPolling(survey_ids);
}

/**
 * TODO: clear interval & unset entry from global map
 * @param {string} survey_id Qualtrics survey ID
 */
async function UntrackSurvey(survey_id) {
  const [db_err, ] = await ProviderCallWrapper( RemoveSurvey(survey_id) );
  if (db_err) [db_err]

  const interval = INTERVAL_MAP.get(survey_id);
  if (interval) {
    clearInterval(interval);
  }
  INTERVAL_MAP.delete(survey_id);

  return [null, null];
}

/**
 * Reset all surveys' #recorded_responses to 0
 * TODO: make this more robust
 */
async function ResetAllSurveyCounters() {
  const survey_ids = [ ...INTERVAL_MAP.keys() ];
  const promises = survey_ids.map(
    x => ProviderCallWrapper( ResetSurveyCounters(x) )
  );

  // const _try_ = async (f, ...args) => {
  //   for (let i=0; i < 50; i++) {
  //     const [err, data] = await f(...args);
  //     if (err) console.error(err);
  //     else return data;
  //   }
  // };

  // const promises = [];
  // for (let i=0; i < survey_ids.length; i++) {
  //   promises.push( _try_( dbHandlers.ResetResponses, survey_ids[i] ) );
  // }

  await Promise.all(promises);
}