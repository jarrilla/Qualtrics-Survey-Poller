//@ts-check

// format.js

/**
 * 
 * @param {*} error the error thrown
 * @param {string} msg 
 * @param {number} status_code 
 */
function packError(error, msg, status_code=500) {
  console.log("----- DEBUG -----");
  console.log(...arguments);
  console.log();
  // TODO: log error to DB from here?

  const ret = [{
    error: error,
    msg: msg,
    status_code: status_code
  }];
  return ret;
}

function packSuccess(data) {
  return [null, data];
}

module.exports = {
  packError: packError,
  packSuccess: packSuccess
};