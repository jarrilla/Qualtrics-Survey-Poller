// @ts-check
// APIErrorHandler.js
// Useful handler for all API controller errors.
// Reports error to developer & logs error.

const { createTransport } = require('nodemailer');
const { Response } = require('express');
const ProviderError = require('./providers/ProviderError');

const SENDER_ADDR         = process.env.MAILER_ADDR;
const SENDER_PWD          = process.env.MAILER_PWD;
const ERROR_REPORTS_ADDR  = process.env.ERROR_REPORTS_ADDR;

// max number of provider call attempts
const MAX_ATTEMPTS = 50;

let TRANSPORTER;

module.exports = {
  APIErrorHandler,
  BackgroundServiceErrorHandler,
  ProviderCallWrapper,

  GetHoursMinutesFromTimeString24,
  GetDifferentIndices
};

// Initialize module
// ------------------------------------
(function() {
  TRANSPORTER = createTransport({
    service: 'gmail',
    auth: {
      user: SENDER_ADDR,
      pass: SENDER_PWD
    }
  })
})();
// ------------------------------------
// ------------------------------------

/**
 * Wrapper for calling async functions up to a maximum number of times before giving up.
 */
 async function ProviderCallWrapper(p) {
  let last_error;
  for (let i=0; i < MAX_ATTEMPTS; i++) {
    try {
      const res = await p;
      return [null, res.data];
    }
    catch (e) {
      last_error = e;
    }
  }

  let { status } = last_error?.response;
  // let { errorMessage } = last_error?.response?.meta.error;
  if (!status) status = 500;

  return BackgroundServiceErrorHandler( new ProviderError(last_error, status) );
  // return [new ProviderError(last_error, status)];
}

/**
 * 
 * @param {ProviderError} error 
 * @param {Response} res
 */
function APIErrorHandler(error, res) {
  notifyDev(error);
  
  res.sendStatus( error.httpStatus );
};

/**
 * Error handler for background service methods.
 * @param {Error} error 
 */
function BackgroundServiceErrorHandler(error) {
  notifyDev(error);
  return [error];
}

/**
 * get Hour and Minutes from a 24-hour time string
 * @param {string} s the string to parse.. format: "hh:ss" (0-23:0-59)
 */
 function GetHoursMinutesFromTimeString24(s) {
  const match = s.match(/(\d{1,2}):(\d{2})/);
  
  return match ? {Hour: Number(match[1]), Minute: Number(match[2])} : null;
}

/**
 * Return an array of indices in which 2 same-length arrays differ
 * @param {any[]} arr1 
 * @param {any[]} arr2 
 */
function GetDifferentIndices(arr1, arr2) {
  const ret = [];
  
  const len = arr1.length;
  for (let i=0; i < len; i++) {
    if (arr1[i] !== arr2[i]) ret.push(i);
  }

  return ret;
}

/**
 * Send error email to developer account.
 * @param {Error} error 
 */
async function notifyDev(error) {
  const subject = `GRH Survey Tracker Error`;

  let text = 'Error: ' + error.toString() + '\n\n';
  if ( error instanceof ProviderError ) {
    text += 'HTTP Status Code: ' + error.httpStatus;
  }
  text += 'Stack:\n' + error.stack;

  const mailOpts = {
    from: SENDER_ADDR,
    to:   ERROR_REPORTS_ADDR,
    subject,
    text
  };

  let err;
  for (let i=0; i < 100; i++) {
    try {
      await TRANSPORTER.sendMail(mailOpts);
      return;
    }
    catch (e) {
      err = e;
    }
  }
  console.error(err);
}