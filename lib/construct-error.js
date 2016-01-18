/**
 * Module dependencies
 */

var _ = require('lodash');



/**
 * Construct an error instance using the specified error definition.
 *
 * @required  {Dictionary} errorDef
 * @optional  {Dictionary} templateData
 * @return {Error}
 */
module.exports = function constructError(errorDef, templateData){

  // Use template data to build error message, or use the default.
  var errorMessage = _.template(errorDef.template)(templateData || {});

  // Construct error
  var err = new Error(errorMessage);

  // Set the new error's `code` property.
  err.code = errorDef.code;

  return err;

};
