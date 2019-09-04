// app/libs/dbHandlers.js
// All of our DynamoDB handlers & table setup

// setup different if in debug
const IS_DEBUG = (process.env.NODE_ENV == "debug");

const AWS = require("aws-sdk");

// libs
const fmt = require("./format");

// setup AWS objects
const __AWS_CONFIG__ = IS_DEBUG ? {
  region: process.env.AWS_REGION,
  endpoint: "http://localhost:8000"
} : {
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
};
AWS.config.update(__AWS_CONFIG__);
const DOC_CLIENT = new AWS.DynamoDB.DocumentClient();
const SURVEYS_TABLE = process.env.SURVEYS_DATA_TABLE;


// Scane the survey tracking table for all entries
// TODO: keep checking for more keys
async function scanTable() {
  const params = {
    TableName: SURVEYS_TABLE,
    KeySchema: [
      { AttributeName: "survey_id", KeyType: "HASH" },
    ],
    AttributeDefinitions: [
      { AttributeName: "survey_id", AttributeType: "S" },
    ],
    FilterExpression: "NOT (survey_id = :fe)",
    ExpressionAttributeValues: { ":fe": "__APP_SETTINGS__" }
  };

  try {
    const data = await DOC_CLIENT.scan(params).promise();

    return fmt.packSuccess(data);
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error scanning SurveyTracker data-table.");
  }
}

/**
 * Attempt to put a new item into tracking data-table. Returns error if survey_id already exists
 * @param {string} survey_name 
 * @param {string} survey_id 
 * @param {string} subject_tel 
 * @param {string} subject_id 
 */
async function putItem(survey_name, survey_id, subject_tel, subject_id=null) {
  const params = {
    TableName: SURVEYS_TABLE,
    Item: {
      // lookup keys
      survey_id: survey_id,

      // survey name (from api)
      survey_name: survey_name,

      // subject telephone
      subject_tel: subject_tel,

      // default fields
      responses_today: 0,
      last_recorded_response_time: null
    },
    ConditionExpression: "attribute_not_exists( #sid )",
    ExpressionAttributeNames: {
      "#sid": "survey_id"
    }
  };
  if (subject_id) params.Item.subject_id = subject_id;

  try {
    // don't need to store result; put() returns {}
    await DOC_CLIENT.put(params).promise();
    return fmt.packSuccess(params.Item);
  }
  catch (e) {
    let msg = "Unexpected error storing survey to SurveyTracker data-table.";

    // item already exists in table
    if (e.code == "ConditionalCheckFailedException") {
      msg = `Survey with id: ${survey_id} is already being tracked.`;
    }
    
    return fmt.packError(e, msg);
  }
}

/**
 * Attempt to remove an item matching survey_id.
 * @param {string} survey_id 
 */
async function removeItem(survey_id) {
  try {
    const params = {
      TableName: SURVEYS_TABLE,
      Key: {
        survey_id: survey_id
      }
    };

    await DOC_CLIENT.delete(params).promise();
    return fmt.packSuccess(null);
  }
  catch (e) {
    fmt.packError(e, "Unexpected error attempting to remove survey from data-table.");
  }
}

/**
 * set a survey's .last_recorded_response_time=new_date
 * and increment .responses_today+1
 * @param {string} survey_id 
 * @param {Date} new_date 
 */
async function updateLastRecordedResponseTime(survey_id, new_date) {
  try {
    const params = {
      TableName: SURVEYS_TABLE,
      Key: { survey_id: survey_id },
      UpdateExpression: "set last_recorded_response_time = :d, responses_today = responses_today + :v",
      ExpressionAttributeValues: {
        ":d": new_date.toISOString(),
        ":v": 1
      },
      ReturnValues: "UPDATED_NEW"
    };

    const res = await DOC_CLIENT.update(params).promise();
    return fmt.packSuccess(res);
  }
  catch (e) {
    fmt.packError(e, "Unexpected error updating last response time in SurveyTracker data-table.");
  }
}

/**
 * Get a survey's latest response time if it exists.
 * @param {string} survey_id Qualtrics survey ID
 */
async function getLastRecordedResponseTime(survey_id) {
  try {
    const params = {
      TableName: SURVEYS_TABLE,
      Key: {
        survey_id: survey_id
      }
    };

    const data = await DOC_CLIENT.get(params).promise();
    return fmt.packSuccess(data);
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error reading response time from SurveyTracker data-table.");
  }
}

/**
 * 
 * @param {*} bulk_settings all the settings to update. Verified in front-end
 */
async function updateStoredSettings(bulk_settings) {
  const { RemoveInactive, PollInterval, SendOnNew, OnNewSms, ProgressSchedule, RestrictSchedule, RestrictedSchedule } = bulk_settings;

  const params = {
    TableName: SURVEYS_TABLE,
    Key: { survey_id: "__APP_SETTINGS__" },
    UpdateExpression: "set remove_inactive = :one, poll_interval = :two, send_on_new = :three, on_new_template = :four, progress_schedule = :five, restrict_schedule = :six, restricted_schedule= :seven",
    ExpressionAttributeValues: {
      ":one": Boolean(RemoveInactive),
      ":two": Number(PollInterval),
      ":three": Boolean(SendOnNew),
      ":four": OnNewSms || " ",
      ":five": ProgressSchedule,
      ":six": Boolean(RestrictSchedule),
      ":seven": RestrictedSchedule
    },
    ReturnValues: "UPDATED_NEW"
  };

  try {
    const d = await DOC_CLIENT.update(params).promise();
    return fmt.packSuccess(null);
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error updating settings in data-table.");
  }
}

async function readStoredSettings() {
  const params = {
    TableName: SURVEYS_TABLE,
    Key: { survey_id: "__APP_SETTINGS__" }
  };

  try {
    const data = await DOC_CLIENT.get(params).promise();
    return fmt.packSuccess(data);
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error reading app settings from data-table.");
  }
}

module.exports = {
  scanTable: scanTable,
  putItem: putItem,
  getLastRecordedResponseTime: getLastRecordedResponseTime,
  updateLastRecordedResponseTime: updateLastRecordedResponseTime,
  removeItem: removeItem,
  updateStoredSettings: updateStoredSettings,
  readStoredSettings: readStoredSettings
};