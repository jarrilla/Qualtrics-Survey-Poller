# Qualtrics.SurveyTracker v2

Simple webapp to track Qualtrics Surveys using webhooks.

API key must have Brand Administrator priviledges for this strategy to work.

Current intended flow:
1. User creates a survey which should be automatically activated. A webhook should then call `/surveys/add` to begin tracking a survey (not sure this is necessary).
1. Whenever a response is submitted, a webhook should call `/surveys/response` which should follow the currently established logic (look at \# of responses and send text to subject)
1. User de-activtes a survey after probing period. A webhook should then call `surveys/remove` to stop tracking the survey (not sure this is necessary).
