// ProviderError.js
// Extend Error to capture an additional message for end-user as well as an HTTP status code.

module.exports = class ProviderError extends Error {

  /**
   * @param {Error} err 
   */
  constructor(err, httpStatus=500) {
    super(err.message);

    this.name = err.name;
    this.stack = err.stack;

    this.httpStatus = httpStatus;
  }

};