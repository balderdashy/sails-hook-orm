//  ██╗   ██╗ █████╗ ██╗     ██╗██████╗  █████╗ ████████╗███████╗
//  ██║   ██║██╔══██╗██║     ██║██╔══██╗██╔══██╗╚══██╔══╝██╔════╝
//  ██║   ██║███████║██║     ██║██║  ██║███████║   ██║   █████╗
//  ╚██╗ ██╔╝██╔══██║██║     ██║██║  ██║██╔══██║   ██║   ██╔══╝
//   ╚████╔╝ ██║  ██║███████╗██║██████╔╝██║  ██║   ██║   ███████╗
//    ╚═══╝  ╚═╝  ╚═╝╚══════╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
//
// Validate that the datastore connection is able to perform the requested
// function based on adapter api version and other checks.

var _ = require('lodash');

module.exports = function validateDatastoreConnection(options) {

  // Grab the datastore identity
  var datastoreIdentity = options.datastoreIdentity;
  if (!datastoreIdentity) {
    throw new Error('Usage Error: datastore validation requires a datastoreIdentity.');
  }

  // Validate the adapter API version
  if (!_.has(options, 'adapterApiVersion') || !_.isNumber(options.adapterApiVersion) || options.adapterApiVersion < 1) {
    throw new Error('The adapter used by the ' + datastoreIdentity + ' datastore does not support leasing connections directly. The adapter\'s API version is outdated. If there is a newer version of the adapter you could try updating versions.');
  }

  // If the adapter doesn't expose it's datastores Waterline won't be
  // able to work with them.
  if (!_.has(options, 'adapter')  || !_.has(options.adapter, 'datastores')) {
    throw new Error('The adapter used by the ' + datastoreIdentity + ' datastore does not support leasing connections directly. It needs to expose it\'s internal datastores in order for them to be used outside the adapter. If there is a newer version of the adapter you could try updating versions.');
  }

  // Find the adapter datastore being used. These will be slightly
  // different because they are implemented to talk to the driver.
  var adapterDatastore = options.adapter.datastores[datastoreIdentity];
  if (!adapterDatastore) {
    throw new Error('The adapter used by the ' + datastoreIdentity + ' datastore does not support leasing connections directly. The adapter\'s datastores don\'t have a reference with the datastore you requested. If there is a newer version of the adapter you could try updating versions.');
  }

  // Validate that the datastore is capable of actually running the
  // augmented methods. If it conforms to the API spec it should have
  // at minimum a `manager`, `driver`, and `config` key on the dictionary.
  if (!_.has(adapterDatastore, 'manager') || !_.has(adapterDatastore, 'driver') || !_.has(adapterDatastore, 'config')) {
    throw new Error('The adapter used by the ' + datastoreIdentity + ' datastore does not support leasing connections directly. It is missing key pieces such as the driver or a manager. If there is a newer version of the adapter you could try updating versions.');
  }

};
