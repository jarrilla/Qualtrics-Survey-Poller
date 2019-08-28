// app/libs/dbHandlers.js
// All of our DynamoDB handlers & table setup

const AWS = require("aws-sdk");

// libs
const fmt = require("./format");

AWS.config.update({
  region: "us-east-2",
  endpoint: "http://localhost:8000"
});

const DYNAMO_DB = new AWS.DynamoDB();
const DOC_CLIENT = new AWS.DynamoDB.DocumentClient();

const TABLE_TITLE = "TrackingSurveys";
const TABLE_PARAMS = {
  TableName: TABLE_TITLE,
  KeySchema: [
    { AttributeName: "survey_id", KeyType: "HASH" },
    { AttributeName: "survey_name", KeyType: "RANGE" }
  ],
  AttributeDefinitions: [
    { AttributeName: "survey_id", AttributeType: "S" },
    { AttributeName: "survey_name", AttributeType: "S" }
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10
  }
};

// Create survey tracking table
// TODO: check to see if table exists ?
async function createTable() {
  try {
    const data = await DYNAMO_DB.createTable(TABLE_PARAMS).promise();
    return [null, data];
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error creating new SurveyTracker data-table.");
  }
}

// Scane the survey tracking table for all entries
// TODO: keep checking for more keys
async function scanTable() {
  try {
    const data = await DOC_CLIENT.scan(TABLE_PARAMS).promise();
    return fmt.packSuccess(data);
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error scanning SurveyTracker data-table.");
  }
}

// Put a new item into survey tracking table
// TODO: do not allow item overwrite from this method
async function putItem(
  survey_name,
  survey_id,
  subject_tel,
  subject_id=null,
) {
  const params = {
    TableName: TABLE_TITLE,
    Item: {
      // lookup keys
      survey_name: survey_name,
      survey_id: survey_id,

      // subject telephone
      subject_tel: subject_tel,

      // default fields
      responses_today: 0,
      tracking_status: "TRACKING",
      last_recorded_response_time: null
    }
  };
  if (subject_id) params.Item.subject_id = subject_id;

  try {
    // don't need to store result; put() returns {}
    await DOC_CLIENT.put(params).promise();
    return fmt.packSuccess(params.Item);
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error storing survey to SurveyTracker data-table.");
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
  getLastRecordedResponseTime: getLastRecordedResponseTime
};