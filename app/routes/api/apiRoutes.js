// @ts-check

// api/routes.js
// all API routes
//----------------------------------------------

// imports
const
express       = require("express"),
router        = express.Router();

// libs
const
config        = require("../../libs/config"),
qualtricsApi  = require("../../libs/qualtricsApiHandlers");
const { scanTable } = require("../../libs/dbHandlers");

//----------------------------------------------


// TODO
// set up authentication middleware

module.exports = router;
//----------------------------------------------
//---------------- API ROUTES ------------------
//----------------------------------------------

router.get('/surveys', getTrackedSurveys);
router.put('/surveys', trackNewSurvey);
router.delete('/surveys', untrackSurvey);

router.patch('/surveys/settings', updateSettings);

//----------------------------------------------
//--------------- DEFINITIONS ------------------
//----------------------------------------------

async function getTrackedSurveys(_req, res) {
  const [err, data] = await scanTable();
  if (err) return res.status(err.status_code).send(err.msg);

  const surveys = data?.Items || [];
  res.send({ surveys });
}

/**
 * Set the time between interval triggers
 */
async function updateSettings(req, res) {
  const [err, ] = await config.updateAppSettings(req.body);
  if (err) res.status(err.status_code).send({error:err.msg});
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

  const [queue_err, queue_res] = await qualtricsApi.trackNewSurvey(SurveyId, SubjectTel, SubjectId);
  if (queue_err) res.status(queue_err.status_code).send({error:queue_err.msg});
  else res.status(200).send(queue_res);
}

/**
 * Untrack a survey if it exists.
 */
async function untrackSurvey(req, res) {
  const { SurveyId } = req.body;

  const [error, ] = await qualtricsApi.untrackSurvey(SurveyId);
  if (error) res.status(error.status_code).send({error:error.msg});
  else res.status(200).send(true);
}