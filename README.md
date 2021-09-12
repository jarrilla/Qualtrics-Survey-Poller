## GRH Survey Tracker
API to poll specified qualtrics surveys & update study subjects via text message as they submit a survey response.

### Strategy
The client is written in plain HTML using Vue & Bootstrap for rendering & Axios for API calls.

The server is written in Node using Express & DynamoDB (core). The following APIs are used:
- Qualtrics (https://api.qualtrics.com/)
- Twilio (https://www.twilio.com/docs/usage/api)

In the ideal case, we would register a webhook whenever the enduser added a new survey to track, which would then immediately notify our API when a survey response is submitted & we could reduce our server load exponentially by using AWS lambda instead.

However, using webhooks with Qualtrics requires the user to be a "Qualtrics brand administrator". Instead, we use a polling method with a default time interval of 10 minutes. That is, every 10m we check a tracked survey & check its responses to see if the latest response is new by checking its timestamp. If it is indeed new, we update the subject via the Twilio API.

### Setup & Testing
Point your browser to `> ./client/index.html`.

To run the server, `> cd ./server ` and `> yarn dev`;

To test our API, use the survey:
http://cmu.ca1.qualtrics.com/jfe/form/SV_dnEGQcB3RAcAVW5