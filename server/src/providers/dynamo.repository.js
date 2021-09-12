// app/libs/dbHandlers.js
// All of our DynamoDB handlers & table setup

const AWS = require("aws-sdk");
const ProviderError = require("./ProviderError");
const { IS_DEBUG, EXIT_CODES } = require('../config/app.config');
const { BackgroundServiceErrorHandler } = require("../utils");

let DOC_CLIENT;
const SURVEYS_TABLE = process.env.SURVEYS_DATA_TABLE;

// setup AWS objects
const __AWS_CONFIG__ = IS_DEBUG ?
{
  region:   process.env.AWS_REGION,
  endpoint: "http://localhost:8000"
} :
{
  accessKeyId:      process.env.AWS_ACCESS_KEY,
  secretAccessKey:  process.env.AWS_SECRET_ACCESS_KEY,
  region:           process.env.AWS_REGION
};
AWS.config.update(__AWS_CONFIG__);

// Initialize module
// ------------------------------------
(function() {
  try {
    DOC_CLIENT = new AWS.DynamoDB.DocumentClient();
  }
  catch (e) {
    BackgroundServiceErrorHandler(e);
    process.exit( EXIT_CODES.DYNAMO_INIT_FAIL );
  }
})();
// ------------------------------------
// ------------------------------------

module.exports = {
  GetSurveys,
  AddSurvey,
  RemoveSurvey,
  GetSurveyLatestResponseTime,
  SetSurveyLatestResponseTime,
  ResetSurveyCounters,

  GetSettings,
  SetSettings,
};

// ------------------------------------------------------
// ------------------------------------------------------
// --------------------- EXPORTS ------------------------
// ------------------------------------------------------
// ------------------------------------------------------

/**
 * Scan SURVEYS_TABLE for all items.
 * Ignores __APP_SETTINGS__ item.
 * 
 * @returns Items in table.
 */
async function GetSurveys() {
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

    return [null, data];
  }
  catch (e) {
    return [new ProviderError(e)];
  }
}

/**
 * Attempt to put a new item into tracking data-table. Returns error if survey_id already exists
 * @param {string} survey_name 
 * @param {string} survey_id 
 * @param {string} subject_tel 
 * @param {string} subject_id 
 */
async function AddSurvey(survey_name, survey_id, subject_tel, subject_id=null) {
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
    // return fmt.packSuccess(params.Item);
    return [null, params.Item];
  }
  catch (e) {
    const httpStatus = e.code === 'ConditionalCheckFailedException' ? 405 : 500;
    return [new ProviderError(e, httpStatus)];
  }
}

/**
 * Attempt to remove an item matching survey_id.
 * @param {string} survey_id 
 */
async function RemoveSurvey(survey_id) {
  try {
    const params = {
      TableName: SURVEYS_TABLE,
      Key: {
        survey_id: survey_id
      }
    };

    await DOC_CLIENT.delete(params).promise();
    // return fmt.packSuccess(null);
    return [null, null];
  }
  catch (e) {
    // fmt.packError(e, "Unexpected error attempting to remove survey from data-table.");
    return [new ProviderError(e)];
  }
}

/**
 * set a survey's .last_recorded_response_time=new_date
 * and increment .responses_today+1
 * @param {string} survey_id 
 * @param {Date} new_date 
 * @param {boolean} increment_count 
 */
async function SetSurveyLatestResponseTime(survey_id, new_date, increment_count) {
  try {
    const params = {
      TableName: SURVEYS_TABLE,
      Key: { survey_id: survey_id },
      UpdateExpression: "set last_recorded_response_time = :d",
      ExpressionAttributeValues: {
        ":d": new_date.toISOString(),
      },
      ReturnValues: "UPDATED_NEW"
    };

    if (increment_count) {
      params.UpdateExpression += ", responses_today = responses_today + :v";
      params.ExpressionAttributeValues[":v"] = 1;
    }

    const res = await DOC_CLIENT.update(params).promise();
    // return fmt.packSuccess(res);
    return [null, res];
  }
  catch (e) {
    // fmt.packError(e, "Unexpected error updating last response time in SurveyTracker data-table.");
    // return [new ProviderError(e)];
    return [e];
  }
}

/**
 * Get a survey's latest response time if it exists.
 * @param {string} survey_id Qualtrics survey ID
 */
async function GetSurveyLatestResponseTime(survey_id) {
  try {
    const params = {
      TableName: SURVEYS_TABLE,
      Key: {
        survey_id: survey_id
      }
    };

    const data = await DOC_CLIENT.get(params).promise();
    // return fmt.packSuccess(data);
    return [null, data];
  }
  catch (e) {
    return [e];
    // return [new ProviderError(e)];
  }
}

/**
 * 
 * @param {*} bulk_settings all the settings to update. Verified in front-end
 */
async function SetSettings(bulk_settings) {
  const { RemoveInactive, PollInterval, AllowedDays, IsScheduleRestricted, RestrictedSchedule } = bulk_settings;

  const params = {
    TableName: SURVEYS_TABLE,
    Key: { survey_id: "__APP_SETTINGS__" },
    UpdateExpression: "set remove_inactive = :one, poll_interval = :two, allowed_days = :three, is_schedule_restricted = :four, restricted_schedule = :five",
    ExpressionAttributeValues: {
      ":one": Boolean( JSON.parse(RemoveInactive) ),
      ":two": Number(PollInterval),
      ":three": AllowedDays,
      ":four": Boolean( JSON.parse(IsScheduleRestricted) ),
      ":five": RestrictedSchedule
    },
    ReturnValues: "UPDATED_NEW"
  };

  try {
    await DOC_CLIENT.update(params).promise();
    return [null, null];
  }
  catch (e) {
    return [new ProviderError(e)];
  }
}

/**
 * Read app settings from DB.
 */
async function GetSettings() {
  const params = {
    TableName: SURVEYS_TABLE,
    Key: { survey_id: "__APP_SETTINGS__" }
  };

  try {
    const data = await DOC_CLIENT.get(params).promise();
    // return fmt.packSuccess(data);
    return [null, data];
  }
  catch (e) {
    return [new ProviderError(e)];
  }
}

/**
 * Reset all tracked survey response-counters to 0.
 * @param {string} survey_id Qualtrics Survey ID
 * @returns 
 */
async function ResetSurveyCounters(survey_id) {
  const params = {
    TableName: SURVEYS_TABLE,
    Key: { survey_id: survey_id },
    UpdateExpression: "set responses_today = :v",
    ExpressionAttributeValues: {
      ":v": 0
    },
    ReturnValues: "UPDATED_NEW"
  };

  try {
    const res = DOC_CLIENT.update(params).promise();
    // return fmt.packSuccess(res);
    return [null, res];
  }
  catch (e) {
    return [e];
  }
}