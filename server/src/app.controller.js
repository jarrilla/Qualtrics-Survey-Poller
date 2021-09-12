// @ts-check

// api/routes.js
// all API routes
//----------------------------------------------

// imports
const express = require("express");
const router = express.Router();
const { TrackNewSurvey, UntrackSurvey } = require('./providers/qualtrics.service');
const { GetSurveys, GetSettings } = require('./providers/dynamo.repository');
const { APIErrorHandler } = require("./utils");
const { UpdateAppSettings } = require("./config/app.config");

// TODO
// set up authentication middleware

module.exports = router;
//----------------------------------------------
//---------------- API ROUTES ------------------
//----------------------------------------------

router.get('/surveys', getTrackedSurveys);
router.put('/surveys', trackNewSurvey);
router.delete('/surveys', untrackSurvey);

router.get('/settings', getSettings);
router.patch('/settings', updateSettings);

//----------------------------------------------
//--------------- DEFINITIONS ------------------
//----------------------------------------------

async function getSettings(_req, res) {
  const [err, data]  = await GetSettings();
  if (err) return APIErrorHandler(err, res);

  const { settings } = data.Item || {};
  res.send({ settings });
}

/**
 * Get an array of all tracked surveys.
 */
async function getTrackedSurveys(_req, res) {
  const [err, data] = await GetSurveys();
  if (err) return APIErrorHandler(err, res);

  const surveys = data?.Items || [];
  res.send({ surveys });
}

/**
 * Set the time between interval triggers
 */
async function updateSettings(req, res) {
  const [err, ] = await UpdateAppSettings(req.body);
  if (err) APIErrorHandler(err, res);
  else res.status(200).send();
}

/**
 * Track a new survey.
 * 
 * Status codes:
 * 201 - OK
 * 400 - Invalid API token
 * 404 - Survey doesn't exist
 * 500 - Internal error.
 */
async function trackNewSurvey(req, res) {
  const { SurveyId, SubjectTel, SubjectId } = req.body;

  const [err, ] = await TrackNewSurvey(SurveyId, SubjectTel, SubjectId);
  if (err) APIErrorHandler(err, res);
  else res.statusStatus(201);
}

/**
 * Untrack a survey if it exists.
 */
async function untrackSurvey(req, res) {
  const { SurveyId } = req.body;

  const [error, ] = await UntrackSurvey(SurveyId);
  if (error) APIErrorHandler(error, res);
  else res.sendStatus(200);
}