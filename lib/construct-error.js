/**
 * Module dependencies
 */

var assert = require('assert');
var _ = require('@sailshq/lodash');



/**
 * Construct an error instance using the specified error definition.
 *
 * @required  {Dictionary} errorDef
 * @optional  {Dictionary} templateData
 * @return {Error}
 */
module.exports = function constructError(errorDef, templateData){

  if (_.isUndefined(templateData)) {
    templateData = {};
  }

  assert(_.isObject(templateData) && !_.isArray(templateData) && !_.isFunction(templateData), 'If specified, `templateData` must be a dictionary.');

  // Use template data to build error message, or use the default.
  var errorMessage = _.template(errorDef.template)(templateData);

  // Construct error
  var err = new Error(errorMessage);

  // Set the new error's `code` property.
  err.code = errorDef.code;

  return err;

};
