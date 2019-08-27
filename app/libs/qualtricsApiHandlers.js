
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
const PRG_POLL_INTERVAL_DELAY=500;

// max number of times to retry polling progress exports
const MAX_PROG_POLL_ATTEMPTS=10;

// qualtrics API call structure
const MAKE_CALL_PARAMS = (params) => {
  if (params) {
    return {
      headers: { "X-API-TOKEN": process.env.QUALTRICS_API_KEY },
      params: params
    };
  }
  else return { headers: { "X-API-TOKEN": process.env.QUALTRICS_API_KEY } };
};

// see qualtrics API
const HOST = "https://cmu.ca1.qualtrics.com/API/v3";
const SURVEY_URL = (survey_id) => `${HOST}/surveys/${survey_id}`;
const EXPORT_SURVEY_URL = (survey_id) => `${SURVEY_URL(survey_id)}/export-responses`;
const EXPORT_PROGRESS_URL = (survey_id, progress_id) =>  `${EXPORT_SURVEY_URL(survey_id)}/${progress_id}`;
const RESPONSE_FILE_URL = (survey_id, file_id) => `${EXPORT_SURVEY_URL(survey_id)}/${file_id}/file`;

//
 async function _callWrapper_(p) {
  let last_error;
  for (let i=0; i < MAX_ATTEMPTS; i++) {
    try {
      const res = await p;
      return fmt.packData(res);
    }
    catch (e) {
      // TODO: log all errors to DB
      last_error = e;
    }
  }
  return [last_error];
}

// Create Response Export
// https://api.qualtrics.com/reference#create-response-export-new// 
async function createResponseExport(survey_id) {
  const call_params = {
    format: "json",
    compress: false
  };
  const [err, res] = await _callWrapper_( axios.post(EXPORT_SURVEY_URL(survey_id), MAKE_CALL_PARAMS(call_params)) );
  if (err) return fmt.packError(err, "Unexpected error creating response export.");
  else return res;
}

// Get Survey
// https://api.qualtrics.com/reference#get-survey
// Using legacy version because it chains better with export functions.
// The information we need is displayed in both versions (surveys & survey-definitions)
async function getSurveyInfo(survey_id) {
  const [err, res] = await _callWrapper_( axios.get(SURVEY_URL(survey_id), MAKE_CALL_PARAMS()) );
  if (err) return fmt.packError(err, "Unexpected error reading survey info.");
  else return res;
}

// Get Response Export Progress
// https://api.qualtrics.com/reference#get-response-export-progress-1
// Get the completion status of an export-progress request.
// Will poll a few times before returning a "time-out" error if unsuccessful.
async function getResponseExportProgress(survey_id, progress_id) {
  
  
  const num_attempts = 0;
  const poll_progress = async () => {
    const [err, res] = await _callWrapper_( axios.get(EXPORT_PROGRESS_URL(survey_id, progress_id), MAKE_CALL_PARAMS()) );
    if (err) return fmt.packError(err, "Unexpected error reading export progress info.");

    if (res && res.percentComplete == 100.0) {
      clearInterval(poll_interval);
      return res;
    }
    else if (++num_attempts == MAX_PROG_POLL_ATTEMPTS) {
      clearInterval(poll_interval);
      return fmt.packError(null, "Timed out waiting for progress request.");
    }
  };

  const poll_interval = setInterval(poll_progress, PRG_POLL_INTERVAL_DELAY);
}

// Get Response Export File
// https://api.qualtrics.com/reference#get-response-export-file-1
// <file_id> comes from result of an export-progress request
// Get the exported file from a previous request
async function getResponseExportFile(survey_id, file_id) {
  const [err, res] = await _callWrapper_( axios.get(RESPONSE_FILE_URL(survey_id, file_id), MAKE_CALL_PARAMS()) );
  if (err) return fmt.packError(err, "Unexpected error reading survey responses file.");
  else return res;
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