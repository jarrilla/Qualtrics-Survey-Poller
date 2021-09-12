// @ts-check
// providers/twilio.service.js
// Twilio API handlers

// libs
const { BackgroundServiceErrorHandler, ProviderCallWrapper } = require("../utils");
const { EXIT_CODES, IS_DEBUG } = require("../config/app.config");
const ProviderError = require("./ProviderError");

// set up twilio access
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SOURCE_NUMBER = process.env.TWILIO_PHONE_NUM;

// rewards for completing surveys
// the last index of each is used for when more than 8 surveys are completed
// so surveys past 8 reward $0 => total is still $28
const PER_SURVEY_REWARD = ["1", "1.50", "2", "2.50", "3", "4", "6", "8", "0"];
const TOTAL_REWARD = ["1", "2.50", "4.50", "7", "10", "14", "20", "28", "28"];

let TWILIO_CLIENT;

module.exports = {
  TextProgressMessage,
};

(function() {
  try {
    if (!IS_DEBUG) {
      TWILIO_CLIENT = require("twilio")(ACCOUNT_SID, AUTH_TOKEN);
    
      if (!SOURCE_NUMBER && !IS_DEBUG) {
        throw new Error('No twilio source number.');
      }
    }
    else {
      if (ACCOUNT_SID && AUTH_TOKEN && SOURCE_NUMBER) {
        TWILIO_CLIENT = require("twilio")(ACCOUNT_SID, AUTH_TOKEN);
      }
    }
  }
  catch (e) {
    BackgroundServiceErrorHandler(e);
    process.exit( EXIT_CODES.TWILIO_INIT_FAIL );
  }
})();

/**
 * Send a progress message to the specified phone number
 * @param {number} total_responses number of recorder responses today
 */
 async function TextProgressMessage(total_responses, subject_tel) {
  // function should not have been called with 0 responses, exit
  if (total_responses == 0) return;

  // which index to use from rewards arrays
  const reward_arrays_index = (total_responses <= 8) ? total_responses-1 : 8;

  // arary index for next survey
  // if we haven't logged 8 reponses yet, next survey will be worth more, otherwise it'll be worth 0
  const next_reward_arrays_index = (reward_arrays_index < 8) ? reward_arrays_index+1 : reward_arrays_index;

  // message to send
  let msg;
  if (total_responses < 8) {
    msg = `You earned $${PER_SURVEY_REWARD[reward_arrays_index]} for this survey. `
        + `Total earned today is $${TOTAL_REWARD[reward_arrays_index]}. `
        + `If this isn't your last survey, next one is worth $${PER_SURVEY_REWARD[next_reward_arrays_index]}.`;
  }
  else if (total_responses == 8) {
    msg = `You earned $${PER_SURVEY_REWARD[reward_arrays_index]} for this survey. `
        + `Total earned today is $${TOTAL_REWARD[reward_arrays_index]}. Congratulations!`;
  }
  else {
    msg = `You have already responded to 8 surveys today.`;
  }

  // now, send the message
  try {
    const [msg_err, ] = await ProviderCallWrapper( sendMessage(msg, subject_tel) );
    if (msg_err) return [msg_err];

    return [null, null];
  }
  catch (e) {
    return [e];
  }
}

/**
 * Send an SMS
 * @param {string} body the message body to send
 * @param {string} to the phone number to send the message to
 */
async function sendMessage(body, to) {

  if ( !TWILIO_CLIENT ) {
    console.debug(body);
  }
  else {
    try {
      const sid = await TWILIO_CLIENT.messages.create({
        body: body,
        to: formatPhoneNumber(to),
        from: formatPhoneNumber(SOURCE_NUMBER)
      });
  
      // return fmt.packSuccess(sid);
      return [null, sid];
    }
    catch (e) {
      return [new ProviderError(e)];
      // return fmt.packError(e, `Unexpected error sending message to ${to}.`);
    }
  }
}

/**
 * Append country code to phone number if none exists
 * @param {string} s phone number string to format
 */
 function formatPhoneNumber(s) {
  return s.startsWith("+1") ? s : "+1"+s;
}