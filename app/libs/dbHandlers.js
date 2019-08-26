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
    return fmt.packError(e, "Unexpected error creating new Survey Tracker data-table.");
  }
}

// Scane the survey tracking table for all entries
// TODO: keep checking for more keys
async function scanTable() {
  try {
    const data = await DOC_CLIENT.scan(TABLE_PARAMS).promise();

    return [null, data];
  }
  catch (e) {
    return fmt.packError(e, "Unexpected error scanning Survey Tracker data.");
  }
}

// Put a new item into survey tracking table
// TODO: do not allow item overwrite from this method
async function putItem(
  survey_name,
  survey_id,
  subject_tel,
  subject_id=null
) {
  const params = {
    TableName: TABLE_TITLE,
    Item: {
      survey_name: survey_name,
      survey_id: survey_id,
      subject_tel: subject_tel,
      responses_today: 0
    }
  };
  if (subject_id) params.Item.subject_id = subject_id;

  try {
    const data = await DOC_CLIENT.put(params).promise();
    return [null, data];
  }
  catch (e) {
    return [err];
  }
}

async function getLastResponseTime(survey_id) {
  
}

module.exports = {
  createTable: createTable,
  scanTable: scanTable,
  putItem: putItem
};