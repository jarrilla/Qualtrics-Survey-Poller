
// app/libs/qualtricsApiHandlers.js
// All Qualtrics API calls through axios for our app.
// -----------------------------------
// -----------------------------------
// -----------------------------------

const axios = require("axios");

const fmt = require("./format");

// max number of api call attempts
const MAX_ATTEMPTS=5;

// (ms) time to way before polling progress exports again
const PROG_POLL_INTERVAL_DELAY=500;

// max number of attempts we'll poll an export progress completion before giving up
const MAX_PROG_POLL_ATTEMPTS=100;

// API headers
const AXIOS_CONFIG = { headers: { "X-API-TOKEN": process.env.QUALTRICS_API_KEY } };

// see qualtrics API
const HOST = "https://cmu.ca1.qualtrics.com/API/v3";
const SURVEY_URL = (survey_id) => `${HOST}/surveys/${survey_id}`;
const EXPORT_SURVEY_URL = (survey_id) => `${SURVEY_URL(survey_id)}/export-responses`;
const EXPORT_PROGRESS_URL = (survey_id, progress_id) =>  `${EXPORT_SURVEY_URL(survey_id)}/${progress_id}`;
const RESPONSE_FILE_URL = (survey_id, file_id) => `${EXPORT_SURVEY_URL(survey_id)}/${file_id}/file`;

// HELPER FUNCTION to re-try API calls up to a few times before giving up
 async function _callWrapper_(p) {
  let last_error;
  for (let i=0; i < MAX_ATTEMPTS; i++) {
    try {
      const res = await p;
      return fmt.packSuccess(res.data);
    }
    catch (e) {
      // TODO: log all errors to DB
      last_error = e;
    }
  }
  return [last_error];
}

// HELPER FUNCTION to check for export progress completion every few seconds
async function _waitForProgressCompletion_(current_try, survey_id, progress_id) {
  const promise = new Promise(async function(resolve, reject) {
    if (++current_try == MAX_PROG_POLL_ATTEMPTS) reject("Timed out waiting for progress request.");

    const [err, data] = await _callWrapper_( axios.get(EXPORT_PROGRESS_URL(survey_id, progress_id), AXIOS_CONFIG) );

    if (err) reject("Unexpected error reading export progress data.");  
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

// Create Response Export
// https://api.qualtrics.com/reference#create-response-export-new// 
async function createResponseExport(survey_id) {
  const post_data = {
    format: "json",
    compress: false
  };
  const [err, data] = await _callWrapper_( axios.post(EXPORT_SURVEY_URL(survey_id), post_data, AXIOS_CONFIG) );
  if (err) return fmt.packError(err, "Unexpected error creating response export.");
  else return fmt.packSuccess(data);
}

// Get Survey
// https://api.qualtrics.com/reference#get-survey
// Using legacy version because it chains better with export functions.
// The information we need is displayed in both versions (surveys & survey-definitions)
async function getSurveyInfo(survey_id) {
  const [err, data] = await _callWrapper_( axios.get(SURVEY_URL(survey_id), AXIOS_CONFIG) );
  if (err) return fmt.packError(err, "Unexpected error reading survey info.");
  else return fmt.packSuccess(data);
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
    return fmt.packSuccess(res);
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error waiting for export progress completion.");
  }
}

// Get Response Export File
// https://api.qualtrics.com/reference#get-response-export-file-1
// <file_id> comes from result of an export-progress request
// Get the exported file from a previous request
async function getResponseExportFile(survey_id, file_id) {
  const [err, data] = await _callWrapper_( axios.get(RESPONSE_FILE_URL(survey_id, file_id), AXIOS_CONFIG) );
  if (err) return fmt.packError(err, "Unexpected error reading survey responses file.");
  else return fmt.packSuccess(data);
}

// -----------------------------------
// -----------------------------------
// -----------------------------------
module.exports = {
  createResponseExport: createResponseExport,
  getSurveyInfo: getSurveyInfo,
  getResponseExportProgress: getResponseExportProgress,
  getResponseExportFile: getResponseExportFile
};