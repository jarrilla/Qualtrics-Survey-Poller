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

//----------------------------------------------


// TODO
// set up middleware


//----------------------------------------------
//---------------- API CALLS -------------------
//----------------------------------------------

/**
 * Set the time between interval triggers
 */
router.post("/updateSettings", async function(req, res) {
  const [err, ] = await config.updateAppSettings(req.body);
  if (err) res.status(err.status_code).send({error:err.msg});
  else res.status(200).send();
})

// attempt to track a new survey
// If survey doesn't exist, returns 404
// If DB insert fails, returns 500
router.post("/trackSurvey", async function(req, res) {
  
  const { SurveyId, SubjectTel, SubjectId } = req.body;

  const [queue_err, queue_res] = await qualtricsApi.trackNewSurvey(SurveyId, SubjectTel, SubjectId);
  if (queue_err) res.status(queue_err.status_code).send({error:queue_err.msg});
  else res.status(200).send(queue_res);
});

/**
 * Untrack a survey if it exists.
 */
router.post("/untrackSurvey", async function(req, res) {
  const { SurveyId } = req.body;

  const [error, ] = await qualtricsApi.untrackSurvey(SurveyId);
  if (error) res.status(error.status_code).send({error:error.msg});
  else res.status(200).send(true);
});

module.exports = router;