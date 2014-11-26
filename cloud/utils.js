/**
 * Created by fengxiaoping on 11/21/14.
 */
var Q = require('q')

exports.getAllByQuery = function (query) {
  var deferred = Q.defer(),
    skip = 0, limit = 500,
    results = [];

  query.limit(limit)
  function getBunch() {
    query.skip(skip)
    query.find(function (items) {
      _.each(items, function (item) {
        results.push(item)
      })
      if (items.length === limit) {
        skip += limit;
        getBunch();
      } else {
        deferred.resolve(results);
      }
    })
  }

  getBunch()
  return deferred.promise
}

exports.synchronize = function (func, options) {
  var deferred = Q.defer()

  func(options, function (success) {
    deferred.resolve(success)
  }, function (err) {
    deferred.reject(err)
  })

  return deferred.promise
}
