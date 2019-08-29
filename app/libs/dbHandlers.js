// app/libs/dbHandlers.js
// All of our DynamoDB handlers & table setup

const AWS = require("aws-sdk");

// libs
const fmt = require("./format");

// setup AWS objects
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});
const DOC_CLIENT = new AWS.DynamoDB.DocumentClient();
const TABLE_TITLE = process.env.SURVEYS_DATA_TABLE;


// Scane the survey tracking table for all entries
// TODO: keep checking for more keys
async function scanTable() {
  const params = {
    TableName: TABLE_TITLE,
    KeySchema: [
      { AttributeName: "survey_id", KeyType: "HASH" },
    ],
    AttributeDefinitions: [
      { AttributeName: "survey_id", AttributeType: "S" },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
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
    TableName: TABLE_TITLE,
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
      TableName: TABLE_TITLE,
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
      TableName: TABLE_TITLE,
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
      TableName: TABLE_TITLE,
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

module.exports = {
  createTable: createTable,
  scanTable: scanTable,
  putItem: putItem,
  getLastRecordedResponseTime: getLastRecordedResponseTime,
  updateLastRecordedResponseTime: updateLastRecordedResponseTime,
  removeItem: removeItem
};