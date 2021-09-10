// ServiceError.js
// Error class that also captures an HTTP status code to return to front end.

module.exports = class ServiceError extends Error {
  
  constructor(message, httpStatus=500) {
    super(message);

    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
    this.httpStatus = httpStatus;
  }

  /**
   * @param {Error} err 
   */
  constructor(err, httpStatus=500) {
    this.message = err.message;
    this.name = err.name;
    this.stack = err.stack;
    this.httpStatus = httpStatus;
  }

  statusCode() {
    return this.httpStatus;
  }

}